#!/usr/bin/env node
// 🤖 AGENTE DE SCRAPING DE DATOS TURÍSTICOS CON IA
// Usa Claude para buscar, validar y estructurar datos automáticamente

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

class TourismDataAgent {
  constructor(apiKey) {
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required. Set it in .env or pass as argument.');
    }

    this.claude = new Anthropic({ apiKey });
    this.enrichedData = {};
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      cached: 0
    };
  }

  /**
   * Enriquecer un municipio con datos turísticos usando IA
   */
  async enrichMunicipality(municipio) {
    console.log(`\n🔍 Procesando: ${municipio.name} (${municipio.code})`);

    try {
      // Paso 1: Intentar IDESCAT primero
      const idescatData = await this.tryIDESCAT(municipio);

      if (idescatData && idescatData.confidence > 0.7) {
        console.log(`  ✅ Datos de IDESCAT encontrados (confianza: ${(idescatData.confidence * 100).toFixed(0)}%)`);
        this.stats.success++;
        return idescatData;
      }

      // Paso 2: Si no hay datos de IDESCAT, usar Claude para buscar
      console.log(`  🤖 Buscando con Claude AI...`);
      const aiData = await this.searchWithClaude(municipio);

      if (aiData && aiData.confidence > 0.6) {
        console.log(`  ✅ Datos encontrados por IA (confianza: ${(aiData.confidence * 100).toFixed(0)}%)`);
        this.stats.success++;
        return aiData;
      }

      // Paso 3: Fallback a estimación inteligente
      console.log(`  ⚠️  Usando estimación inteligente`);
      const estimated = await this.intelligentEstimate(municipio);
      this.stats.success++;
      return estimated;

    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      this.stats.failed++;
      return null;
    }
  }

  /**
   * Intentar obtener datos de IDESCAT
   */
  async tryIDESCAT(municipio) {
    try {
      // IDESCAT tiene diferentes endpoints según el tipo de dato
      const urls = [
        `https://api.idescat.cat/emex/v1/dades.json?id=${municipio.code}&i=3201`, // Población
        `https://api.idescat.cat/emex/v1/dades.json?id=${municipio.code}&i=t24`   // Turismo
      ];

      // Intentar todas las URLs en paralelo
      const responses = await Promise.allSettled(
        urls.map(url => axios.get(url, { timeout: 5000 }).catch(() => null))
      );

      // Filtrar respuestas exitosas
      const validResponses = responses
        .filter(r => r.status === 'fulfilled' && r.value?.data)
        .map(r => r.value.data);

      if (validResponses.length === 0) {
        return null;
      }

      // Usar Claude para interpretar los datos de IDESCAT
      return await this.interpretIDESCATData(municipio, validResponses);

    } catch (error) {
      return null;
    }
  }

  /**
   * Interpretar datos de IDESCAT con Claude
   */
  async interpretIDESCATData(municipio, responses) {
    const prompt = `Analiza estos datos de IDESCAT para el municipio "${municipio.name}" (código ${municipio.code}):

${JSON.stringify(responses, null, 2)}

Extrae y estructura:
1. population: Población actual (número)
2. hotel_places: Plazas hoteleras totales (número, si disponible)
3. categoria: Clasificación geográfica (costa/montaña/ciudad/interior)
4. tourism_intensity: Intensidad turística base 0.0-1.0
5. confidence: Tu confianza en estos datos 0.0-1.0
6. source: "IDESCAT"

Si NO encuentras datos de plazas hoteleras, déjalo en 0.
Si NO puedes determinar algo con certeza, estima basándote en el nombre y tipo de municipio.

Responde SOLO con JSON válido en este formato exacto:
{
  "population": 0,
  "hotel_places": 0,
  "categoria": "costa|montaña|ciudad|interior",
  "tourism_intensity": 0.0,
  "confidence": 0.0,
  "source": "IDESCAT"
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      });

      const jsonText = response.content[0].text.trim();
      const data = JSON.parse(jsonText);

      return {
        ...data,
        name: municipio.name,
        code: municipio.code
      };
    } catch (error) {
      console.error(`    Error interpretando IDESCAT:`, error.message);
      return null;
    }
  }

  /**
   * Buscar datos con Claude usando conocimiento general
   */
  async searchWithClaude(municipio) {
    const prompt = `Eres un experto en turismo de Catalunya. Necesito datos turísticos para el municipio "${municipio.name}" (código INE: ${municipio.code}).

Basándote en tu conocimiento de Catalunya, proporciona:

1. population: Población aproximada (si es famoso/conocido, estima basándote en ciudades similares)
2. hotel_places: Plazas hoteleras aproximadas (0 si es un pueblo pequeño sin turismo)
3. categoria: Clasificación geográfica
   - "costa": Si está en Costa Brava, Costa Dorada o Mar Mediterráneo
   - "montaña": Si está en Pirineos o zonas montañosas
   - "ciudad": Si es capital provincial o ciudad importante (>50k habitantes)
   - "interior": Resto de municipios
4. tourism_intensity: Intensidad turística base 0.0-1.0
   - 0.8-1.0: Destinos muy turísticos (Lloret, Salou, Barcelona centro)
   - 0.6-0.8: Turismo alto (Sitges, Cadaqués, estaciones esquí)
   - 0.4-0.6: Turismo moderado (Girona, Tarragona, pueblos conocidos)
   - 0.2-0.4: Turismo bajo (municipios pequeños)
   - 0.0-0.2: Muy poco turismo
5. confidence: Tu nivel de confianza 0.0-1.0
   - 0.9-1.0: Muy seguro (municipio famoso que conoces bien)
   - 0.7-0.9: Bastante seguro (has oído hablar de él)
   - 0.5-0.7: Moderado (puedes hacer estimación razonable)
   - <0.5: Baja confianza (municipio desconocido)

Responde SOLO con JSON válido en este formato exacto:
{
  "population": 0,
  "hotel_places": 0,
  "categoria": "costa|montaña|ciudad|interior",
  "tourism_intensity": 0.0,
  "confidence": 0.0,
  "source": "AI_Knowledge",
  "reasoning": "Breve explicación de tu estimación"
}`;

    try {
      const response = await this.claude.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      });

      const jsonText = response.content[0].text.trim();
      // Extraer JSON si viene envuelto en markdown
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      const data = JSON.parse(jsonMatch ? jsonMatch[0] : jsonText);

      return {
        ...data,
        name: municipio.name,
        code: municipio.code
      };
    } catch (error) {
      console.error(`    Error en búsqueda IA:`, error.message);
      return null;
    }
  }

  /**
   * Estimación inteligente como último recurso
   */
  async intelligentEstimate(municipio) {
    // Estimación básica por defecto
    return {
      name: municipio.name,
      code: municipio.code,
      population: 5000, // Estimación para municipio pequeño
      hotel_places: 0,
      categoria: 'interior',
      tourism_intensity: 0.15,
      confidence: 0.3,
      source: 'Fallback_Estimate'
    };
  }

  /**
   * Procesar múltiples municipios en batch
   */
  async enrichBatch(municipios, options = {}) {
    const { limit = 50, delay = 2000 } = options;

    console.log(`\n🚀 INICIANDO ENRIQUECIMIENTO DE DATOS CON IA`);
    console.log(`📊 Total municipios: ${municipios.length}`);
    console.log(`🎯 Límite: ${limit}`);
    console.log(`⏱️  Delay entre requests: ${delay}ms\n`);
    console.log('='.repeat(70));

    const toProcess = municipios.slice(0, limit);
    this.stats.total = toProcess.length;

    for (let i = 0; i < toProcess.length; i++) {
      const municipio = toProcess[i];

      console.log(`\n[${i + 1}/${toProcess.length}] Procesando...`);

      const data = await this.enrichMunicipality(municipio);

      if (data) {
        this.enrichedData[municipio.code] = data;
      }

      // Delay para no sobrecargar APIs
      if (i < toProcess.length - 1) {
        await this.sleep(delay);
      }

      // Mostrar progreso cada 10
      if ((i + 1) % 10 === 0) {
        this.printStats();
      }
    }

    console.log('\n' + '='.repeat(70));
    console.log('✅ ENRIQUECIMIENTO COMPLETADO\n');
    this.printStats();

    return this.enrichedData;
  }

  /**
   * Guardar resultados en formato compatible
   */
  async saveResults(outputPath = 'agents/enriched-data.json') {
    const output = {
      generated_at: new Date().toISOString(),
      stats: this.stats,
      municipalities: this.enrichedData
    };

    await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n💾 Resultados guardados en: ${outputPath}`);
    console.log(`📊 Total enriquecidos: ${Object.keys(this.enrichedData).length}`);
  }

  /**
   * Generar código para real-tourism-data.js
   */
  generateCodeSnippet() {
    console.log('\n📝 CÓDIGO PARA real-tourism-data.js:\n');
    console.log('// === DATOS ENRIQUECIDOS POR IA ===');

    Object.entries(this.enrichedData)
      .filter(([_, data]) => data.confidence > 0.6) // Solo alta confianza
      .forEach(([code, data]) => {
        console.log(`  '${code}': { name: '${data.name}', population: ${data.population}, hotel_places: ${data.hotel_places}, tourism_intensity: ${data.tourism_intensity}, categoria: '${data.categoria}' }, // ${data.source} (${(data.confidence * 100).toFixed(0)}%)`);
      });
  }

  // Utilidades
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printStats() {
    console.log(`\n📊 ESTADÍSTICAS:`);
    console.log(`   Total procesados: ${this.stats.success + this.stats.failed}/${this.stats.total}`);
    console.log(`   ✅ Exitosos: ${this.stats.success}`);
    console.log(`   ❌ Fallidos: ${this.stats.failed}`);
    console.log(`   📈 Tasa éxito: ${((this.stats.success / (this.stats.success + this.stats.failed)) * 100).toFixed(1)}%`);
  }
}

// 🚀 EJECUCIÓN PRINCIPAL
async function main() {
  // Verificar API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ Error: ANTHROPIC_API_KEY no configurada');
    console.log('\n💡 Configúrala con:');
    console.log('   export ANTHROPIC_API_KEY="sk-ant-..."');
    console.log('   O crea un archivo .env con:');
    console.log('   ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  // Cargar TopoJSON para obtener lista de municipios
  const topoPath = resolve('public/geojson/cat-municipis.json');
  const topoData = JSON.parse(await readFile(topoPath, 'utf-8'));

  // Extraer municipios sin datos reales
  const existingDataPath = resolve('data/real-tourism-data.js');
  const existingDataContent = await readFile(existingDataPath, 'utf-8');

  const allMunicipios = topoData.objects.municipis.geometries.map(g => ({
    code: String(g.id),
    name: g.properties.nom
  }));

  // Filtrar municipios que ya tienen datos
  const municipiosToEnrich = allMunicipios.filter(m => {
    return !existingDataContent.includes(`'${m.code}':`);
  });

  console.log(`\n🎯 Municipios totales: ${allMunicipios.length}`);
  console.log(`✅ Con datos reales: ${allMunicipios.length - municipiosToEnrich.length}`);
  console.log(`🔍 Por enriquecer: ${municipiosToEnrich.length}\n`);

  // Parse argumentos de línea de comandos
  const args = process.argv.slice(2);
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;

  console.log(`⚙️  Configuración: Procesar ${limit} municipios (usa --limit=N para cambiar)\n`);

  // Crear agente y procesar
  const agent = new TourismDataAgent(apiKey);

  const enrichedData = await agent.enrichBatch(municipiosToEnrich, {
    limit,
    delay: 1500 // 1.5s entre requests
  });

  // Guardar resultados
  await agent.saveResults();

  // Generar código para copiar
  agent.generateCodeSnippet();

  console.log('\n🎉 PROCESO COMPLETADO');
  console.log('\n📋 Próximos pasos:');
  console.log('   1. Revisa agents/enriched-data.json');
  console.log('   2. Copia los municipios de alta confianza a data/real-tourism-data.js');
  console.log('   3. Ejecuta: node scripts/generate-from-topojson.js');
  console.log('   4. Ejecuta: npm run build\n');
}

// Ejecutar si es script principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
}

export default TourismDataAgent;
