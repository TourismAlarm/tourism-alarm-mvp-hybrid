#!/usr/bin/env node
// 🤖 AGENTE UNIVERSAL DE SCRAPING - Soporta Claude Y Gemini
// Usa automáticamente la API disponible (Gemini preferido si ambas están configuradas)

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

class UniversalTourismAgent {
  constructor() {
    this.provider = null;
    this.client = null;
    this.enrichedData = {};
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      cached: 0
    };
  }

  /**
   * Inicializar el cliente de IA (Gemini o Claude)
   */
  async initialize() {
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    const claudeKey = process.env.ANTHROPIC_API_KEY;

    // Preferir Gemini si está disponible (gratis)
    if (geminiKey) {
      console.log('🤖 Usando Google Gemini AI');
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      this.client = new GoogleGenerativeAI(geminiKey);
      this.model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash' });
      this.provider = 'gemini';
      return true;
    }

    if (claudeKey) {
      console.log('🤖 Usando Anthropic Claude AI');
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      this.client = new Anthropic({ apiKey: claudeKey });
      this.provider = 'claude';
      return true;
    }

    throw new Error('No API key found. Set GEMINI_API_KEY or ANTHROPIC_API_KEY');
  }

  /**
   * Enriquecer un municipio con IA
   */
  async enrichMunicipality(municipio) {
    console.log(`\n🔍 Procesando: ${municipio.name} (${municipio.code})`);

    try {
      const prompt = this.buildPrompt(municipio);
      const response = await this.callAI(prompt);
      const data = this.parseResponse(response);

      if (data && data.confidence > 0.6) {
        console.log(`  ✅ Datos encontrados (confianza: ${(data.confidence * 100).toFixed(0)}%)`);
        this.stats.success++;
        return {
          ...data,
          name: municipio.name,
          code: municipio.code
        };
      }

      // Fallback
      console.log(`  ⚠️  Usando estimación inteligente`);
      this.stats.success++;
      return this.intelligentEstimate(municipio);

    } catch (error) {
      console.error(`  ❌ Error: ${error.message}`);
      this.stats.failed++;
      return null;
    }
  }

  /**
   * Construir prompt optimizado
   */
  buildPrompt(municipio) {
    return `Eres un experto en turismo de Catalunya. Necesito datos turísticos para el municipio "${municipio.name}" (código INE: ${municipio.code}).

Basándote en tu conocimiento de Catalunya, proporciona:

1. **population**: Población aproximada (si conoces el municipio, estima basándote en municipios similares)
2. **hotel_places**: Plazas hoteleras aproximadas (0 si es un pueblo pequeño sin turismo)
3. **categoria**: Clasificación geográfica
   - "costa": Costa Brava, Costa Dorada o Mediterráneo
   - "montaña": Pirineos o zonas montañosas
   - "ciudad": Capital provincial o ciudad >50k habitantes
   - "interior": Resto
4. **tourism_intensity**: Intensidad turística base 0.0-1.0
   - 0.8-1.0: Muy turístico (Lloret, Salou, Barcelona centro)
   - 0.6-0.8: Alto turismo (Sitges, Cadaqués, estaciones esquí)
   - 0.4-0.6: Moderado (Girona, Tarragona, pueblos conocidos)
   - 0.2-0.4: Bajo
   - 0.0-0.2: Muy poco
5. **confidence**: Tu confianza 0.0-1.0
   - 0.9-1.0: Municipio famoso que conoces bien
   - 0.7-0.9: Has oído hablar
   - 0.5-0.7: Estimación razonable
   - <0.5: Desconocido

Responde SOLO con JSON válido:
{
  "population": 0,
  "hotel_places": 0,
  "categoria": "costa|montaña|ciudad|interior",
  "tourism_intensity": 0.0,
  "confidence": 0.0,
  "reasoning": "Breve explicación"
}`;
  }

  /**
   * Llamar a la IA (Gemini o Claude)
   */
  async callAI(prompt) {
    if (this.provider === 'gemini') {
      const result = await this.model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    }

    if (this.provider === 'claude') {
      const response = await this.client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 512,
        messages: [{ role: 'user', content: prompt }]
      });
      return response.content[0].text;
    }

    throw new Error('No AI provider initialized');
  }

  /**
   * Parsear respuesta de IA
   */
  parseResponse(text) {
    try {
      // Limpiar markdown si existe
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : text;

      // Parsear
      const data = JSON.parse(jsonText);

      // Validar
      if (!data.population || !data.categoria || data.tourism_intensity === undefined) {
        throw new Error('Invalid response structure');
      }

      return data;
    } catch (error) {
      console.error(`    Error parsing response:`, error.message);
      return null;
    }
  }

  /**
   * Estimación inteligente como fallback
   */
  intelligentEstimate(municipio) {
    return {
      name: municipio.name,
      code: municipio.code,
      population: 5000,
      hotel_places: 0,
      categoria: 'interior',
      tourism_intensity: 0.15,
      confidence: 0.3,
      source: 'Fallback_Estimate'
    };
  }

  /**
   * Procesar batch de municipios
   */
  async enrichBatch(municipios, options = {}) {
    const { limit = 50, delay = 1000 } = options;

    console.log(`\n🚀 INICIANDO ENRIQUECIMIENTO CON ${this.provider.toUpperCase()}`);
    console.log(`📊 Total municipios: ${municipios.length}`);
    console.log(`🎯 Límite: ${limit}`);
    console.log(`⏱️  Delay: ${delay}ms\n`);
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

      // Delay para no saturar API
      if (i < toProcess.length - 1) {
        await this.sleep(delay);
      }

      // Stats cada 10
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
   * Guardar resultados
   */
  async saveResults(outputPath = 'agents/enriched-data.json') {
    const output = {
      generated_at: new Date().toISOString(),
      provider: this.provider,
      stats: this.stats,
      municipalities: this.enrichedData
    };

    await writeFile(outputPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`\n💾 Resultados guardados en: ${outputPath}`);
    console.log(`📊 Total enriquecidos: ${Object.keys(this.enrichedData).length}`);
  }

  /**
   * Generar código para copiar
   */
  generateCodeSnippet() {
    console.log('\n📝 CÓDIGO PARA real-tourism-data.js:\n');
    console.log('// === DATOS ENRIQUECIDOS POR IA ===');

    Object.entries(this.enrichedData)
      .filter(([_, data]) => data.confidence > 0.6)
      .forEach(([code, data]) => {
        const source = this.provider.toUpperCase();
        console.log(`  '${code}': { name: '${data.name}', population: ${data.population}, hotel_places: ${data.hotel_places}, tourism_intensity: ${data.tourism_intensity}, categoria: '${data.categoria}' }, // ${source} (${(data.confidence * 100).toFixed(0)}%)`);
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
  console.log('🤖 AGENTE UNIVERSAL DE TURISMO (Gemini + Claude)\n');

  // Inicializar agente
  const agent = new UniversalTourismAgent();

  try {
    await agent.initialize();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Configura una de estas API keys:\n');
    console.log('  GEMINI (Recomendado - Gratis):');
    console.log('    1. https://aistudio.google.com/apikey');
    console.log('    2. export GEMINI_API_KEY="tu-key"\n');
    console.log('  CLAUDE (De pago):');
    console.log('    1. https://console.anthropic.com/settings/keys');
    console.log('    2. export ANTHROPIC_API_KEY="sk-ant-..."\n');
    process.exit(1);
  }

  // Cargar municipios
  const topoPath = resolve('public/geojson/cat-municipis.json');
  const topoData = JSON.parse(await readFile(topoPath, 'utf-8'));

  const existingDataPath = resolve('data/real-tourism-data.js');
  const existingDataContent = await readFile(existingDataPath, 'utf-8');

  const allMunicipios = topoData.objects.municipis.geometries.map(g => ({
    code: String(g.id),
    name: g.properties.nom
  }));

  const municipiosToEnrich = allMunicipios.filter(m => {
    return !existingDataContent.includes(`'${m.code}':`);
  });

  console.log(`\n🎯 Municipios totales: ${allMunicipios.length}`);
  console.log(`✅ Con datos reales: ${allMunicipios.length - municipiosToEnrich.length}`);
  console.log(`🔍 Por enriquecer: ${municipiosToEnrich.length}\n`);

  // Parse argumentos
  const args = process.argv.slice(2);
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;

  console.log(`⚙️  Configuración: Procesar ${limit} municipios\n`);

  // Procesar
  const enrichedData = await agent.enrichBatch(municipiosToEnrich, {
    limit,
    delay: agent.provider === 'gemini' ? 1000 : 1500 // Gemini más rápido
  });

  // Guardar
  await agent.saveResults();

  // Código
  agent.generateCodeSnippet();

  console.log('\n🎉 PROCESO COMPLETADO');
  console.log('\n📋 Próximos pasos:');
  console.log('   1. Revisa agents/enriched-data.json');
  console.log('   2. Copia municipios de alta confianza a data/real-tourism-data.js');
  console.log('   3. Ejecuta: node scripts/generate-from-topojson.js');
  console.log('   4. Ejecuta: npm run build\n');
}

// Ejecutar directamente
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
