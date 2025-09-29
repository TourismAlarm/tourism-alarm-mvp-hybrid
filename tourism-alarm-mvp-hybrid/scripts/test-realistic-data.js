// 🧪 Test verificación datos realistas
import { readFile } from 'node:fs/promises';

async function testRealisticData() {
  try {
    console.log('🧪 VERIFICANDO DATOS REALISTAS...\n');

    const data = JSON.parse(await readFile('public/data/current.json', 'utf-8'));

    // Estadísticas distribución
    const intensities = data.points.map(p => p[2]);
    const stats = {
      total: intensities.length,
      min: Math.min(...intensities),
      max: Math.max(...intensities),
      avg: (intensities.reduce((a,b) => a+b, 0) / intensities.length).toFixed(2),
      low: intensities.filter(i => i < 0.3).length,
      medium: intensities.filter(i => i >= 0.3 && i < 0.6).length,
      high: intensities.filter(i => i >= 0.6).length
    };

    console.log('📊 ESTADÍSTICAS DISTRIBUCIÓN:');
    console.log(`   Total puntos: ${stats.total}`);
    console.log(`   Rango: ${stats.min} - ${stats.max}`);
    console.log(`   Promedio: ${stats.avg}`);
    console.log(`   Baja (verde): ${stats.low} municipios`);
    console.log(`   Media (amarillo): ${stats.medium} municipios`);
    console.log(`   Alta (rojo): ${stats.high} municipios\n`);

    // Verificar municipios clave
    console.log('🎯 VERIFICACIÓN MUNICIPIOS CLAVE:');

    const expectedHighIntensity = ['Barcelona', 'Sitges', 'Lloret', 'Salou'];
    const expectedLowIntensity = ['Lleida', 'Cervera', 'Manresa'];

    if (data.municipalities) {
      expectedHighIntensity.forEach(name => {
        const found = data.municipalities.find(m => m.name.includes(name));
        if (found) {
          const status = found.tourism_intensity > 0.6 ? '✅' : '⚠️';
          console.log(`   ${status} ${found.name}: ${found.tourism_intensity}`);
        }
      });

      expectedLowIntensity.forEach(name => {
        const found = data.municipalities.find(m => m.name.includes(name));
        if (found) {
          const status = found.tourism_intensity < 0.4 ? '✅' : '⚠️';
          console.log(`   ${status} ${found.name}: ${found.tourism_intensity}`);
        }
      });
    }

    // Evaluar realismo
    const isRealistic = stats.avg < 0.5 && stats.low > stats.high;
    console.log(`\n🏁 REALISMO: ${isRealistic ? '✅ BUENO' : '⚠️ MEJORABLE'}`);

  } catch (error) {
    console.error('❌ Error test:', error.message);
  }
}

await testRealisticData();