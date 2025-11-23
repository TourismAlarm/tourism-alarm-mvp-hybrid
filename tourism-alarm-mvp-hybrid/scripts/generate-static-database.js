#!/usr/bin/env node
// 📊 GENERADOR DE BASE DE DATOS ESTÁTICA DE MUNICIPIOS
// Ejecutar UNA SOLA VEZ para crear la base de datos completa
// Los datos estáticos (población, plazas, categoría) no cambian cada día

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function generateStaticDatabase() {
  console.log('📊 GENERANDO BASE DE DATOS ESTÁTICA DE MUNICIPIOS\n');
  console.log('='.repeat(70));

  // 1. Cargar TopoJSON con todos los municipios
  console.log('\n1️⃣  Cargando municipios de Catalunya...');
  const topoPath = resolve('public/geojson/cat-municipis.json');
  const topoData = JSON.parse(await readFile(topoPath, 'utf-8'));

  const allMunicipios = topoData.objects.municipis.geometries.map(g => ({
    code: String(g.id),
    name: g.properties.nom
  }));

  console.log(`   ✅ ${allMunicipios.length} municipios encontrados`);

  // 2. Cargar datos reales existentes
  console.log('\n2️⃣  Cargando datos reales existentes...');
  const realDataPath = resolve('data/real-tourism-data.js');
  const realDataContent = await readFile(realDataPath, 'utf-8');

  // Extraer datos del archivo JS
  const realData = {};
  const regex = /'(\d+)':\s*\{([^}]+)\}/g;
  let match;

  while ((match = regex.exec(realDataContent)) !== null) {
    const code = match[1];
    const content = match[2];

    // Parsear los campos
    const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/);
    const popMatch = content.match(/population:\s*(\d+)/);
    const hotelMatch = content.match(/hotel_places:\s*(\d+)/);
    const intensityMatch = content.match(/tourism_intensity:\s*([\d.]+)/);
    const catMatch = content.match(/categoria:\s*['"]([^'"]+)['"]/);

    if (nameMatch) {
      realData[code] = {
        name: nameMatch[1],
        population: popMatch ? parseInt(popMatch[1]) : null,
        hotel_places: hotelMatch ? parseInt(hotelMatch[1]) : null,
        tourism_intensity_base: intensityMatch ? parseFloat(intensityMatch[1]) : null,
        categoria: catMatch ? catMatch[1] : 'interior',
        source: 'REAL_DATA'
      };
    }
  }

  console.log(`   ✅ ${Object.keys(realData).length} municipios con datos reales`);

  // 3. Cargar datos enriquecidos por IA
  console.log('\n3️⃣  Cargando datos enriquecidos por IA...');
  let enrichedData = {};

  try {
    const enrichedPath = resolve('agents/enriched-data.json');
    const enrichedContent = await readFile(enrichedPath, 'utf-8');
    const enrichedJson = JSON.parse(enrichedContent);
    enrichedData = enrichedJson.municipalities || {};
    console.log(`   ✅ ${Object.keys(enrichedData).length} municipios enriquecidos por IA`);
  } catch {
    console.log('   ⚠️  No hay datos enriquecidos todavía');
  }

  // 4. Combinar todo en la base de datos estática
  console.log('\n4️⃣  Generando base de datos estática...');

  const staticDatabase = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_municipalities: allMunicipios.length,
      with_real_data: Object.keys(realData).length,
      with_ai_data: Object.keys(enrichedData).length,
      version: '1.0'
    },
    municipalities: {}
  };

  // Procesar cada municipio
  for (const muni of allMunicipios) {
    const real = realData[muni.code];
    const ai = enrichedData[muni.code];

    staticDatabase.municipalities[muni.code] = {
      name: muni.name,
      code: muni.code,

      // Datos estáticos (no cambian)
      population: real?.population || ai?.population || null,
      hotel_places: real?.hotel_places || ai?.hotel_places || null,
      categoria: real?.categoria || ai?.categoria || 'interior',
      tourism_intensity_base: real?.tourism_intensity_base || ai?.tourism_intensity || 0.2,

      // Metadata
      data_source: real ? 'OFFICIAL' : (ai ? 'AI_ENRICHED' : 'UNKNOWN'),
      confidence: real ? 1.0 : (ai?.confidence || 0),
      needs_enrichment: !real && !ai
    };
  }

  // Estadísticas
  const stats = {
    official: 0,
    ai_enriched: 0,
    unknown: 0
  };

  Object.values(staticDatabase.municipalities).forEach(m => {
    if (m.data_source === 'OFFICIAL') stats.official++;
    else if (m.data_source === 'AI_ENRICHED') stats.ai_enriched++;
    else stats.unknown++;
  });

  // 5. Guardar base de datos
  const outputPath = resolve('data/static-municipality-data.json');
  await writeFile(outputPath, JSON.stringify(staticDatabase, null, 2), 'utf-8');

  console.log(`   ✅ Base de datos guardada en: data/static-municipality-data.json`);

  // 6. Resumen
  console.log('\n' + '='.repeat(70));
  console.log('✅ BASE DE DATOS ESTÁTICA GENERADA\n');
  console.log('📊 Estadísticas:');
  console.log(`   • Total municipios: ${allMunicipios.length}`);
  console.log(`   • Con datos oficiales: ${stats.official}`);
  console.log(`   • Enriquecidos por IA: ${stats.ai_enriched}`);
  console.log(`   • Sin datos: ${stats.unknown}`);
  console.log(`   • Cobertura: ${((stats.official + stats.ai_enriched) / allMunicipios.length * 100).toFixed(1)}%`);

  console.log('\n💡 Esta base de datos contiene datos ESTÁTICOS:');
  console.log('   • Población');
  console.log('   • Plazas hoteleras');
  console.log('   • Categoría (costa/montaña/ciudad/interior)');
  console.log('   • Intensidad turística BASE');

  console.log('\n📅 Para datos DINÁMICOS (ocupación diaria), usa:');
  console.log('   npm run daily:snapshot\n');
}

generateStaticDatabase().catch(console.error);
