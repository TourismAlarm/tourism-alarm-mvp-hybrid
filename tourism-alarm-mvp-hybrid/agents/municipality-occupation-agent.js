#!/usr/bin/env node
// 📅 AGENTE DE OCUPACIÓN POR MUNICIPIO
// Obtiene ocupación de cada municipio turístico individualmente
// Más preciso que por zonas, procesa ~150 municipios con turismo

import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

class MunicipalityOccupationAgent {
  constructor() {
    this.model = null;
    this.today = new Date().toISOString().split('T')[0];
    this.stats = { total: 0, success: 0, failed: 0 };
  }

  async initialize() {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!geminiKey) {
      throw new Error('GEMINI_API_KEY no configurada');
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(geminiKey);
    this.model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

    console.log('🤖 Usando Google Gemini AI\n');
    return true;
  }

  /**
   * Obtener municipios turísticos (con hotel_places > 0 o intensidad > 0.3)
   */
  async getTouristMunicipalities() {
    // Intentar cargar desde base de datos estática
    try {
      const staticPath = resolve('data/static-municipality-data.json');
      const data = JSON.parse(await readFile(staticPath, 'utf-8'));

      return Object.entries(data.municipalities)
        .filter(([_, m]) => m.hotel_places > 0 || m.tourism_intensity_base > 0.3)
        .map(([code, m]) => ({
          code,
          name: m.name,
          categoria: m.categoria,
          hotel_places: m.hotel_places,
          base_intensity: m.tourism_intensity_base
        }));
    } catch {
      // Fallback: cargar desde real-tourism-data.js
      const realDataPath = resolve('data/real-tourism-data.js');
      const content = await readFile(realDataPath, 'utf-8');

      const municipalities = [];
      const regex = /'(\d+)':\s*\{[^}]*name:\s*['"]([^'"]+)['"][^}]*categoria:\s*['"]([^'"]+)['"][^}]*\}/g;
      let match;

      while ((match = regex.exec(content)) !== null) {
        municipalities.push({
          code: match[1],
          name: match[2],
          categoria: match[3],
          hotel_places: 100,
          base_intensity: 0.5
        });
      }

      return municipalities;
    }
  }

  /**
   * Obtener ocupación de un municipio específico
   */
  async getMunicipalityOccupation(municipality) {
    const prompt = `Para "${municipality.name}" en Catalunya (${this.today}), estima:

occupation_percentage: 0-100 (ocupación hotelera)
tourist_pressure: 0.0-1.0 (presión turística)
trend: "subiendo", "estable" o "bajando"

Responde SOLO este JSON válido sin explicaciones:
{"occupation_percentage": 30, "tourist_pressure": 0.3, "trend": "estable"}`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();

      // Limpiar respuesta
      text = text
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .trim();

      // Buscar JSON
      const jsonMatch = text.match(/\{[^{}]*"occupation_percentage"[^{}]*\}/);
      if (!jsonMatch) {
        console.log(`      ⚠️ No JSON: ${text.substring(0, 100)}`);
        return null;
      }

      let jsonText = jsonMatch[0]
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']');

      const data = JSON.parse(jsonText);

      // Validar y sanitizar
      if (data.occupation_percentage === undefined) {
        console.log(`      ⚠️ Falta occupation_percentage`);
        return null;
      }

      return {
        occupation_percentage: Math.max(0, Math.min(100, parseInt(data.occupation_percentage) || 0)),
        tourist_pressure: Math.max(0, Math.min(1, parseFloat(data.tourist_pressure) || 0)),
        trend: ['subiendo', 'estable', 'bajando'].includes(data.trend) ? data.trend : 'estable'
      };

    } catch (error) {
      console.log(`      ⚠️ Error: ${error.message}`);
      return null;
    }
  }

  getDayOfWeek() {
    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    return days[new Date().getDay()];
  }

  /**
   * Procesar todos los municipios turísticos
   */
  async processAllMunicipalities(options = {}) {
    const { limit = 999, delay = 1000 } = options;

    const municipalities = await this.getTouristMunicipalities();
    const toProcess = municipalities.slice(0, limit);

    console.log(`📅 SNAPSHOT POR MUNICIPIO: ${this.today}`);
    console.log('='.repeat(70));
    console.log(`\n🎯 Municipios turísticos encontrados: ${municipalities.length}`);
    console.log(`📊 Procesando: ${toProcess.length}`);
    console.log(`⏱️  Tiempo estimado: ${Math.ceil(toProcess.length * delay / 60000)} minutos\n`);

    const snapshot = {
      date: this.today,
      timestamp: new Date().toISOString(),
      type: 'municipality',
      municipalities: {}
    };

    this.stats.total = toProcess.length;

    for (let i = 0; i < toProcess.length; i++) {
      const muni = toProcess[i];

      // Mostrar progreso cada 10 municipios
      if (i % 10 === 0 || i === toProcess.length - 1) {
        const percent = Math.round((i + 1) / toProcess.length * 100);
        console.log(`[${i + 1}/${toProcess.length}] ${percent}% - ${muni.name}...`);
      }

      const data = await this.getMunicipalityOccupation(muni);

      if (data) {
        snapshot.municipalities[muni.code] = {
          name: muni.name,
          categoria: muni.categoria,
          ...data,
          fetched_at: new Date().toISOString()
        };
        this.stats.success++;
      } else {
        this.stats.failed++;
      }

      // Delay para no saturar API
      if (i < toProcess.length - 1) {
        await new Promise(r => setTimeout(r, delay));
      }
    }

    return snapshot;
  }

  /**
   * Guardar snapshot
   */
  async saveSnapshot(snapshot) {
    const dir = resolve('data/daily-snapshots');
    await mkdir(dir, { recursive: true });

    // Guardar snapshot del día
    const filename = `${snapshot.date}-municipalities.json`;
    await writeFile(resolve(dir, filename), JSON.stringify(snapshot, null, 2), 'utf-8');

    // Guardar como latest
    await writeFile(resolve(dir, 'latest-municipalities.json'), JSON.stringify(snapshot, null, 2), 'utf-8');

    console.log(`\n💾 Guardado: data/daily-snapshots/${filename}`);
  }

  /**
   * Integrar con datos del mapa
   */
  async integrateWithMapData(snapshot) {
    console.log('\n📊 Integrando con datos del mapa...');

    try {
      const mapDataPath = resolve('public/data/current.json');
      const mapData = JSON.parse(await readFile(mapDataPath, 'utf-8'));

      let updated = 0;

      for (const [code, occData] of Object.entries(snapshot.municipalities)) {
        const muni = mapData.municipalities?.find(m => m.id === code);
        if (muni) {
          // Actualizar intensidad con ocupación real
          const baseIntensity = muni.tourism_intensity || 0.3;
          const realPressure = occData.tourist_pressure;

          // 50% base + 50% presión real
          muni.tourism_intensity = (baseIntensity * 0.5) + (realPressure * 0.5);
          muni.occupation_percentage = occData.occupation_percentage;
          muni.trend = occData.trend;
          muni.last_updated = snapshot.date;
          updated++;
        }
      }

      mapData.metadata = mapData.metadata || {};
      mapData.metadata.last_municipality_snapshot = snapshot.date;
      mapData.metadata.municipalities_with_live_data = updated;

      await writeFile(mapDataPath, JSON.stringify(mapData, null, 2), 'utf-8');
      console.log(`   ✅ ${updated} municipios actualizados en el mapa`);

    } catch (error) {
      console.log(`   ⚠️  Error integrando: ${error.message}`);
    }
  }

  printStats() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 ESTADÍSTICAS:');
    console.log(`   Total procesados: ${this.stats.success + this.stats.failed}/${this.stats.total}`);
    console.log(`   ✅ Exitosos: ${this.stats.success}`);
    console.log(`   ❌ Fallidos: ${this.stats.failed}`);
    console.log(`   📈 Tasa éxito: ${(this.stats.success / this.stats.total * 100).toFixed(1)}%`);
  }
}

// EJECUCIÓN PRINCIPAL
async function main() {
  console.log('📅 AGENTE DE OCUPACIÓN POR MUNICIPIO\n');

  const agent = new MunicipalityOccupationAgent();

  try {
    await agent.initialize();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  // Parsear límite de argumentos
  const args = process.argv.slice(2);
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 999;

  // Procesar municipios
  const snapshot = await agent.processAllMunicipalities({ limit, delay: 1000 });

  // Guardar
  await agent.saveSnapshot(snapshot);

  // Integrar con mapa
  await agent.integrateWithMapData(snapshot);

  // Stats
  agent.printStats();

  // Resumen
  const topMunicipalities = Object.entries(snapshot.municipalities)
    .sort((a, b) => b[1].occupation_percentage - a[1].occupation_percentage)
    .slice(0, 5);

  if (topMunicipalities.length > 0) {
    console.log('\n🔥 TOP 5 Municipios con más ocupación:');
    topMunicipalities.forEach(([code, data], i) => {
      console.log(`   ${i + 1}. ${data.name}: ${data.occupation_percentage}% (${data.trend})`);
    });
  }

  console.log('\n✅ PROCESO COMPLETADO\n');
}

main().catch(console.error);
