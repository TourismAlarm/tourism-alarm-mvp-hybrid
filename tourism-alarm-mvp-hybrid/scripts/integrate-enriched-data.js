#!/usr/bin/env node
// 🔄 SCRIPT DE INTEGRACIÓN AUTOMÁTICA
// Integra los datos enriquecidos por IA a real-tourism-data.js

import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function integrateEnrichedData() {
  console.log('🔄 INTEGRANDO DATOS ENRIQUECIDOS\n');
  console.log('='.repeat(70));

  try {
    // 1. Leer datos enriquecidos
    console.log('\n1️⃣  Leyendo datos enriquecidos...');
    const enrichedPath = resolve('agents/enriched-data.json');
    let enrichedData;

    try {
      const content = await readFile(enrichedPath, 'utf-8');
      enrichedData = JSON.parse(content);
    } catch (error) {
      console.log('   ❌ No se encontró agents/enriched-data.json');
      console.log('   💡 Ejecuta primero: npm run agent:scrape');
      return false;
    }

    const municipalities = enrichedData.municipalities || {};
    const count = Object.keys(municipalities).length;

    if (count === 0) {
      console.log('   ⚠️  No hay datos para integrar');
      return false;
    }

    console.log(`   ✅ Encontrados ${count} municipios enriquecidos`);

    // 2. Leer archivo actual de datos
    console.log('\n2️⃣  Leyendo real-tourism-data.js...');
    const dataPath = resolve('data/real-tourism-data.js');
    let currentContent = await readFile(dataPath, 'utf-8');
    console.log('   ✅ Archivo leído');

    // 3. Filtrar solo municipios de alta confianza (>= 0.7)
    console.log('\n3️⃣  Filtrando municipios de alta confianza...');
    const highConfidence = Object.entries(municipalities)
      .filter(([_, data]) => data.confidence >= 0.7)
      .sort((a, b) => b[1].confidence - a[1].confidence);

    console.log(`   ✅ ${highConfidence.length} municipios con confianza >= 70%`);

    // 4. Generar código para insertar
    console.log('\n4️⃣  Generando código...');

    // Encontrar municipios que ya existen
    const existingCodes = new Set();
    const codeRegex = /'(\d+)':\s*{/g;
    let match;
    while ((match = codeRegex.exec(currentContent)) !== null) {
      existingCodes.add(match[1]);
    }

    // Filtrar solo nuevos
    const newMunicipalities = highConfidence.filter(([code]) => !existingCodes.has(code));
    console.log(`   📊 ${existingCodes.size} municipios existentes`);
    console.log(`   ✨ ${newMunicipalities.length} municipios nuevos para añadir`);

    if (newMunicipalities.length === 0) {
      console.log('\n   ℹ️  No hay municipios nuevos para añadir');
      return true;
    }

    // 5. Generar código de inserción
    const insertionCode = newMunicipalities.map(([code, data]) => {
      const name = data.name.replace(/'/g, "\\'");
      return `  '${code}': { name: '${name}', population: ${data.population}, hotel_places: ${data.hotel_places}, tourism_intensity: ${data.tourism_intensity}, categoria: '${data.categoria}' }, // IA ${data.source || 'GEMINI'} (${Math.round(data.confidence * 100)}%)`;
    }).join('\n');

    // 6. Insertar antes del cierre del objeto
    console.log('\n5️⃣  Insertando datos...');

    // Encontrar la posición del último }; y insertar antes
    const closingBraceIndex = currentContent.lastIndexOf('};');
    if (closingBraceIndex === -1) {
      console.log('   ❌ No se pudo encontrar el cierre del objeto REAL_TOURISM_DATA');
      return false;
    }

    // Añadir sección de datos IA
    const iaSection = `
  // === DATOS ENRIQUECIDOS POR IA (${new Date().toISOString().split('T')[0]}) ===
${insertionCode}
`;

    const newContent = currentContent.slice(0, closingBraceIndex) + iaSection + currentContent.slice(closingBraceIndex);

    // 7. Guardar archivo
    await writeFile(dataPath, newContent, 'utf-8');
    console.log('   ✅ Archivo actualizado');

    // 8. Mostrar resumen
    console.log('\n' + '='.repeat(70));
    console.log('✅ INTEGRACIÓN COMPLETADA\n');
    console.log(`📊 Resumen:`);
    console.log(`   • Municipios añadidos: ${newMunicipalities.length}`);
    console.log(`   • Total en archivo: ${existingCodes.size + newMunicipalities.length}`);

    console.log('\n📋 Próximos pasos:');
    console.log('   1. Ejecuta: node scripts/generate-from-topojson.js');
    console.log('   2. Ejecuta: npm run build');
    console.log('   3. Verifica en localhost\n');

    return true;

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    return false;
  }
}

// Ejecutar
integrateEnrichedData().then(success => {
  process.exit(success ? 0 : 1);
});
