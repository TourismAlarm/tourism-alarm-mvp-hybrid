// Test rápido de conectividad y datos
import { readFile } from 'node:fs/promises';

async function testData() {
  try {
    console.log('🧪 Testeando datos generados...');

    const data = JSON.parse(await readFile('public/data/current.json', 'utf-8'));

    console.log(`📊 Municipios: ${data.municipalities_count}`);
    console.log(`🎯 Coordenadas reales: ${data.real_coordinates_count}`);
    console.log(`🕐 Última actualización: ${data.updated_at}`);
    console.log(`🗺️ Puntos heatmap: ${data.points.length}`);

    // Verificar algunos municipios importantes
    const important = ['Barcelona', 'Girona', 'Tarragona', 'Reus'];
    important.forEach(name => {
      const found = data.municipalities.find(m => m.name.includes(name));
      if (found) {
        console.log(`✅ ${name}: [${found.latitude}, ${found.longitude}] - ${Math.round(found.tourism_intensity * 100)}%`);
      } else {
        console.log(`⚠️ ${name}: no encontrado`);
      }
    });

  } catch (error) {
    console.error('❌ Error testeando datos:', error.message);
  }
}

await testData();