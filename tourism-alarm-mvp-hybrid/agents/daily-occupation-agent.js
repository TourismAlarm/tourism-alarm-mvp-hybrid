#!/usr/bin/env node
// 📅 AGENTE DE OCUPACIÓN DIARIA
// Pregunta a Gemini la ocupación actual y eventos para cada zona turística
// Ejecutar cada día para obtener datos dinámicos

import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

class DailyOccupationAgent {
  constructor() {
    this.provider = null;
    this.model = null;
    this.today = new Date().toISOString().split('T')[0];
  }

  async initialize() {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!geminiKey) {
      throw new Error('GEMINI_API_KEY no configurada');
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI(geminiKey);
    this.model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });
    this.provider = 'gemini';

    console.log('🤖 Usando Google Gemini AI');
    return true;
  }

  /**
   * Obtener ocupación de una zona turística
   */
  async getZoneOccupation(zone) {
    const prompt = `Eres un experto en turismo de Catalunya. Fecha actual: ${this.today}.

Para la zona turística "${zone.name}" (${zone.description}), estima:

1. **occupation_percentage**: Ocupación hotelera actual estimada (0-100%)
   - Considera: época del año, día de la semana, eventos conocidos
   - Noviembre suele ser temporada baja excepto puentes festivos

2. **tourist_pressure**: Presión turística actual (0.0-1.0)
   - 0.8-1.0: Saturación (colas, aglomeraciones)
   - 0.5-0.8: Alta afluencia
   - 0.3-0.5: Normal
   - 0.0-0.3: Baja

3. **active_events**: Lista de eventos/festivales activos o próximos (máx 3)
   - Formato: [{"name": "...", "impact": "alto/medio/bajo"}]

4. **weather_impact**: Impacto del clima en turismo (-0.3 a +0.3)
   - Positivo si buen tiempo atrae turistas
   - Negativo si mal tiempo reduce afluencia

5. **trend**: Tendencia respecto a la semana anterior
   - "subiendo", "estable", "bajando"

6. **reasoning**: Breve explicación (1-2 frases)

Responde SOLO con JSON válido:
{
  "occupation_percentage": 0,
  "tourist_pressure": 0.0,
  "active_events": [],
  "weather_impact": 0.0,
  "trend": "estable",
  "reasoning": "..."
}`;

    try {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      // Extraer JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      return null;
    }
  }

  /**
   * Procesar todas las zonas turísticas principales
   */
  async processAllZones() {
    // Zonas turísticas principales de Catalunya
    const zones = [
      { id: 'costa_brava_norte', name: 'Costa Brava Norte', description: 'Roses, Cadaqués, L\'Escala, Empuriabrava' },
      { id: 'costa_brava_centro', name: 'Costa Brava Centro', description: 'Lloret de Mar, Tossa de Mar, Blanes' },
      { id: 'costa_brava_sur', name: 'Costa Brava Sur', description: 'Palamós, Sant Feliu de Guíxols, Platja d\'Aro' },
      { id: 'costa_dorada', name: 'Costa Dorada', description: 'Salou, Cambrils, Tarragona, PortAventura' },
      { id: 'barcelona_ciudad', name: 'Barcelona Ciudad', description: 'Barcelona centro, Gràcia, Barceloneta' },
      { id: 'barcelona_costa', name: 'Costa Barcelona', description: 'Sitges, Castelldefels, Vilanova' },
      { id: 'pirineos_aran', name: 'Val d\'Aran', description: 'Vielha, Baqueira-Beret, Naut Aran' },
      { id: 'pirineos_cerdanya', name: 'Cerdanya', description: 'Puigcerdà, La Molina, Masella, Alp' },
      { id: 'pirineos_pallars', name: 'Pallars-Ribagorça', description: 'Sort, Vall de Boí, Aigüestortes' },
      { id: 'interior_garrotxa', name: 'Garrotxa', description: 'Olot, Besalú, Zona Volcánica' },
      { id: 'interior_penedes', name: 'Penedès', description: 'Vilafranca, Sant Sadurní, Bodegas' },
      { id: 'montserrat', name: 'Montserrat', description: 'Monasterio de Montserrat y alrededores' }
    ];

    console.log(`\n📅 SNAPSHOT DIARIO: ${this.today}`);
    console.log('='.repeat(70));
    console.log(`\n🎯 Procesando ${zones.length} zonas turísticas...\n`);

    const snapshot = {
      date: this.today,
      timestamp: new Date().toISOString(),
      provider: this.provider,
      zones: {}
    };

    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      console.log(`[${i + 1}/${zones.length}] ${zone.name}...`);

      const data = await this.getZoneOccupation(zone);

      if (data) {
        snapshot.zones[zone.id] = {
          ...zone,
          ...data,
          fetched_at: new Date().toISOString()
        };
        console.log(`   ✅ Ocupación: ${data.occupation_percentage}% | Presión: ${(data.tourist_pressure * 100).toFixed(0)}%`);
      } else {
        snapshot.zones[zone.id] = {
          ...zone,
          occupation_percentage: null,
          tourist_pressure: null,
          error: true
        };
        console.log(`   ⚠️  Sin datos`);
      }

      // Delay entre requests
      if (i < zones.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return snapshot;
  }

  /**
   * Guardar snapshot diario
   */
  async saveSnapshot(snapshot) {
    // Asegurar que existe el directorio
    const dir = resolve('data/daily-snapshots');
    await mkdir(dir, { recursive: true });

    // Guardar snapshot del día
    const filename = `${snapshot.date}.json`;
    const filepath = resolve(dir, filename);
    await writeFile(filepath, JSON.stringify(snapshot, null, 2), 'utf-8');

    console.log(`\n💾 Snapshot guardado: data/daily-snapshots/${filename}`);

    // También guardar como "latest"
    const latestPath = resolve(dir, 'latest.json');
    await writeFile(latestPath, JSON.stringify(snapshot, null, 2), 'utf-8');

    return filepath;
  }

  /**
   * Actualizar histórico anual
   */
  async updateHistorical(snapshot) {
    const historicalPath = resolve('data/historical-data.json');
    let historical = { years: {} };

    try {
      const content = await readFile(historicalPath, 'utf-8');
      historical = JSON.parse(content);
    } catch {
      // Archivo no existe, crear nuevo
    }

    const year = snapshot.date.split('-')[0];
    if (!historical.years[year]) {
      historical.years[year] = { snapshots: [] };
    }

    // Añadir resumen del día
    const dailySummary = {
      date: snapshot.date,
      avg_occupation: 0,
      avg_pressure: 0,
      zones_count: Object.keys(snapshot.zones).length
    };

    // Calcular promedios
    const validZones = Object.values(snapshot.zones).filter(z => z.occupation_percentage !== null);
    if (validZones.length > 0) {
      dailySummary.avg_occupation = Math.round(
        validZones.reduce((sum, z) => sum + z.occupation_percentage, 0) / validZones.length
      );
      dailySummary.avg_pressure = parseFloat(
        (validZones.reduce((sum, z) => sum + z.tourist_pressure, 0) / validZones.length).toFixed(2)
      );
    }

    // Evitar duplicados
    const existingIndex = historical.years[year].snapshots.findIndex(s => s.date === snapshot.date);
    if (existingIndex >= 0) {
      historical.years[year].snapshots[existingIndex] = dailySummary;
    } else {
      historical.years[year].snapshots.push(dailySummary);
    }

    // Ordenar por fecha
    historical.years[year].snapshots.sort((a, b) => a.date.localeCompare(b.date));

    await writeFile(historicalPath, JSON.stringify(historical, null, 2), 'utf-8');
    console.log(`📈 Histórico actualizado: data/historical-data.json`);
  }
}

// EJECUCIÓN PRINCIPAL
async function main() {
  console.log('📅 AGENTE DE OCUPACIÓN DIARIA\n');

  const agent = new DailyOccupationAgent();

  try {
    await agent.initialize();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Configura GEMINI_API_KEY en el archivo .env');
    process.exit(1);
  }

  // Procesar zonas
  const snapshot = await agent.processAllZones();

  // Guardar
  await agent.saveSnapshot(snapshot);
  await agent.updateHistorical(snapshot);

  // Resumen
  console.log('\n' + '='.repeat(70));
  console.log('✅ SNAPSHOT DIARIO COMPLETADO\n');

  const validZones = Object.values(snapshot.zones).filter(z => z.occupation_percentage !== null);
  const avgOccupation = validZones.length > 0
    ? Math.round(validZones.reduce((sum, z) => sum + z.occupation_percentage, 0) / validZones.length)
    : 0;

  console.log(`📊 Resumen del día ${snapshot.date}:`);
  console.log(`   • Zonas procesadas: ${Object.keys(snapshot.zones).length}`);
  console.log(`   • Ocupación media: ${avgOccupation}%`);

  // Mostrar zonas con más actividad
  const topZones = validZones
    .sort((a, b) => b.occupation_percentage - a.occupation_percentage)
    .slice(0, 3);

  if (topZones.length > 0) {
    console.log(`\n🔥 Zonas con más ocupación:`);
    topZones.forEach((z, i) => {
      console.log(`   ${i + 1}. ${z.name}: ${z.occupation_percentage}%`);
    });
  }

  console.log('\n💡 Próximos pasos:');
  console.log('   • Ver snapshot: cat data/daily-snapshots/latest.json');
  console.log('   • Ver histórico: cat data/historical-data.json');
  console.log('   • Comparar con año anterior: npm run compare:yearly\n');
}

main().catch(console.error);
