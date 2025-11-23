// 🎯 GENERADOR DE DATOS PARA MAPA COROPLÉTICO
// Simplificado: Solo genera datos de municipios, sin puntos de heatmap
// La visualización usa polígonos coloreados (coropleta)

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateComplete947Municipalities } from '../data/catalunya-complete.js';

async function generateCatalunyaData() {
  console.log('🎯 Generando datos para mapa coroplético...\n');

  try {
    // Generar datos base de todos los municipios
    const baseData = generateComplete947Municipalities();

    console.log(`📊 Total municipios: ${baseData.municipalities.length}`);

    // Estadísticas
    const withRealData = baseData.municipalities.filter(m => m.has_real_data).length;
    const byCategory = {
      costa: baseData.municipalities.filter(m => m.categoria === 'costa').length,
      montaña: baseData.municipalities.filter(m => m.categoria === 'montaña').length,
      ciudad: baseData.municipalities.filter(m => m.categoria === 'ciudad').length,
      interior: baseData.municipalities.filter(m => m.categoria === 'interior').length
    };

    // Datos simplificados para el frontend (sin puntos de heatmap)
    const outputData = {
      metadata: {
        generated_at: new Date().toISOString(),
        total_municipalities: baseData.municipalities.length,
        with_real_data: withRealData,
        visualization: 'choropleth', // Solo coropleta
        version: '2.0'
      },
      categories: byCategory,
      municipalities: baseData.municipalities.map(m => ({
        id: m.id,
        name: m.name,
        lat: m.lat,
        lng: m.lng,
        tourism_intensity: m.tourism_intensity,
        categoria: m.categoria,
        population: m.population || 0,
        hotel_places: m.hotel_places || 0,
        has_real_data: m.has_real_data || false
      })),
      // Mantener compatibilidad con código antiguo pero vacío
      points: []
    };

    console.log('\n📊 ESTADÍSTICAS:');
    console.log(`   Total municipios: ${outputData.metadata.total_municipalities}`);
    console.log(`   Con datos reales: ${withRealData} (${(withRealData/outputData.metadata.total_municipalities*100).toFixed(1)}%)`);
    console.log(`   Costa: ${byCategory.costa}`);
    console.log(`   Montaña: ${byCategory.montaña}`);
    console.log(`   Ciudad: ${byCategory.ciudad}`);
    console.log(`   Interior: ${byCategory.interior}`);

    return outputData;

  } catch (error) {
    console.error('❌ Error generando datos:', error.message);
    throw error;
  }
}

// 💾 EJECUTAR Y GUARDAR
try {
  const data = await generateCatalunyaData();

  // Guardar datos actuales
  await writeFile(
    resolve('public/data/current.json'),
    JSON.stringify(data, null, 2)
  );

  // Guardar backup
  await writeFile(
    resolve('public/data/last-good.json'),
    JSON.stringify(data, null, 2)
  );

  const fileSizeKB = Math.round(JSON.stringify(data).length / 1024);

  console.log('\n✅ Datos guardados correctamente');
  console.log(`📁 Tamaño: ${fileSizeKB} KB (antes ~2MB con puntos)`);
  console.log(`🗺️ Visualización: Coropleta (polígonos coloreados)`);
  console.log(`📍 Puntos heatmap: ELIMINADOS (innecesarios)`);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
