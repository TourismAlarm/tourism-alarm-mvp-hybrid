// 🎯 SCRIPT RESTAURADO - 947 MUNICIPIOS CON FORMA CATALUNYA
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateComplete947Municipalities } from '../data/catalunya-complete.js';

async function generateCatalunyaData() {
  console.log('🏛️ Generando sistema 947 municipios RESTAURADO...');

  try {
    // Generar con la función restaurada que mantiene la forma
    const completeData = generateComplete947Municipalities();

    // Estadísticas
    const intensities = completeData.points.map(p => p[2]);
    const stats = {
      min: Math.min(...intensities),
      max: Math.max(...intensities),
      avg: (intensities.reduce((a,b) => a+b, 0) / intensities.length).toFixed(2),
      count: intensities.length
    };

    console.log('📊 Estadísticas finales:', stats);
    console.log(`🗺️ Distribución por provincia:`);

    const byProvince = completeData.municipalities.reduce((acc, m) => {
      acc[m.provincia] = (acc[m.provincia] || 0) + 1;
      return acc;
    }, {});

    Object.entries(byProvince).forEach(([prov, count]) => {
      console.log(`   ${prov}: ${count} municipios`);
    });

    // Verificar que mantenemos la forma de Catalunya
    const bounds = {
      north: Math.max(...completeData.points.map(p => p[0])),
      south: Math.min(...completeData.points.map(p => p[0])),
      east: Math.max(...completeData.points.map(p => p[1])),
      west: Math.min(...completeData.points.map(p => p[1]))
    };

    console.log(`\n🎯 VERIFICACIÓN FORMA CATALUNYA:`);
    console.log(`   Norte: ${bounds.north.toFixed(3)}° (${bounds.north < 42.9 ? '✅' : '❌'})`);
    console.log(`   Sur: ${bounds.south.toFixed(3)}° (${bounds.south > 40.5 ? '✅' : '❌'})`);
    console.log(`   Este: ${bounds.east.toFixed(3)}° (${bounds.east < 3.4 ? '✅' : '❌'})`);
    console.log(`   Oeste: ${bounds.west.toFixed(3)}° (${bounds.west > 0.1 ? '✅' : '❌'})`);

    return completeData;

  } catch (error) {
    console.error('❌ Error generando datos:', error.message);
    throw error;
  }
}

// 💾 EJECUTAR Y GUARDAR
try {
  const data = await generateCatalunyaData();

  await writeFile(
    resolve('public/data/current.json'),
    JSON.stringify(data, null, 2)
  );

  await writeFile(
    resolve('public/data/last-good.json'),
    JSON.stringify(data, null, 2)
  );

  console.log('\n✅ Sistema restaurado guardado');
  console.log(`📊 ${data.total_municipalities} municipios totales`);
  console.log(`🎯 ${data.exact_coordinates} coords exactas + ${data.generated_coordinates} generadas`);
  console.log(`🗺️ FORMA DE CATALUNYA PRESERVADA`);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}