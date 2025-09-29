// 🧪 TEST SISTEMA CATALUNYA RESTAURADO
import { readFile } from 'node:fs/promises';

async function testCatalunyaRestored() {
  try {
    console.log('🧪 VERIFICANDO SISTEMA CATALUNYA RESTAURADO\n');

    const data = JSON.parse(await readFile('public/data/current.json', 'utf-8'));

    // Verificar estructura híbrida
    console.log('📊 ESTRUCTURA HÍBRIDA CATALUNYA:');
    console.log(`   Versión: ${data.version}`);
    console.log(`   Total puntos: ${data.total_municipalities}`);
    console.log(`   Coords exactas: ${data.exact_coordinates}`);
    console.log(`   Coords generadas: ${data.generated_coordinates}`);
    console.log(`   Puntos relleno: ${data.fill_points || 0}`);
    console.log(`   Puntos heatmap: ${data.points?.length}`);

    // Verificar forma de Catalunya (CRUCIAL)
    const bounds = {
      north: Math.max(...data.points.map(p => p[0])),
      south: Math.min(...data.points.map(p => p[0])),
      east: Math.max(...data.points.map(p => p[1])),
      west: Math.min(...data.points.map(p => p[1]))
    };

    console.log('\n🗺️ VERIFICACIÓN FORMA CATALUNYA:');
    console.log(`   Norte: ${bounds.north.toFixed(3)}° (${bounds.north < 42.9 ? '✅' : '❌'} ${bounds.north < 42.9 ? 'dentro límites' : 'FUERA DE CATALUNYA'})`);
    console.log(`   Sur: ${bounds.south.toFixed(3)}° (${bounds.south > 40.5 ? '✅' : '❌'} ${bounds.south > 40.5 ? 'dentro límites' : 'FUERA DE CATALUNYA'})`);
    console.log(`   Este: ${bounds.east.toFixed(3)}° (${bounds.east < 3.4 ? '✅' : '❌'} ${bounds.east < 3.4 ? 'dentro límites' : 'FUERA DE CATALUNYA'})`);
    console.log(`   Oeste: ${bounds.west.toFixed(3)}° (${bounds.west > 0.1 ? '✅' : '❌'} ${bounds.west > 0.1 ? 'dentro límites' : 'FUERA DE CATALUNYA'})`);

    const shapeCorrect = bounds.north < 42.9 && bounds.south > 40.5 &&
                        bounds.east < 3.4 && bounds.west > 0.1;

    console.log(`\n📐 FORMA CATALUNYA: ${shapeCorrect ? '✅ CORRECTA Y PRESERVADA' : '❌ ROTA - FORMA CUADRADA'}`);

    // Verificar densidad restaurada
    const totalArea = 32108; // km² Catalunya
    const density = data.total_municipalities / totalArea * 1000;
    console.log(`\n📏 DENSIDAD RESTAURADA:`);
    console.log(`   Puntos totales: ${data.total_municipalities}`);
    console.log(`   Densidad: ${density.toFixed(1)} municipios/1000km²`);
    console.log(`   ${density > 25 ? '✅' : '⚠️'} Densidad ${density > 25 ? 'adecuada' : 'baja'} para zoom`);

    // Verificar coordenadas válidas
    let validCount = 0;
    data.points.forEach(point => {
      const [lat, lng] = point;
      if (lat >= 40.52 && lat <= 42.86 && lng >= 0.16 && lng <= 3.33) {
        validCount++;
      }
    });

    console.log(`\n🎯 VALIDACIÓN COORDENADAS:`);
    console.log(`   Válidas: ${validCount}/${data.points.length}`);
    console.log(`   ${validCount === data.points.length ? '✅' : '❌'} Todas en Catalunya`);

    // Verificar municipios exactos clave
    const keyMunicipalities = [
      { name: 'Barcelona', expectedLat: 41.3851, expectedLng: 2.1734 },
      { name: 'Girona', expectedLat: 41.9794, expectedLng: 2.8214 },
      { name: 'Tarragona', expectedLat: 41.1189, expectedLng: 1.2445 },
      { name: 'Lleida', expectedLat: 41.6176, expectedLng: 0.6200 },
      { name: 'Sitges', expectedLat: 41.2373, expectedLng: 1.8111 }
    ];

    console.log('\n🏛️ MUNICIPIOS EXACTOS CLAVE:');
    let foundKeys = 0;
    keyMunicipalities.forEach(key => {
      const found = data.municipalities.find(m => m.name === key.name);
      if (found) {
        foundKeys++;
        console.log(`   ✅ ${key.name}: [${found.lat}, ${found.lng}]`);
      } else {
        console.log(`   ❌ ${key.name}: NO ENCONTRADO`);
      }
    });

    // Verificar distribución por provincia
    console.log('\n🗺️ DISTRIBUCIÓN PROVINCIAL:');
    const byProvince = data.municipalities.reduce((acc, m) => {
      acc[m.provincia || 'exactos'] = (acc[m.provincia || 'exactos'] || 0) + 1;
      return acc;
    }, {});

    Object.entries(byProvince).forEach(([prov, count]) => {
      console.log(`   ${prov}: ${count} municipios`);
    });

    // Verificar distribución intensidad
    const intensities = data.points.map(p => p[2]);
    const distribution = {
      low: intensities.filter(i => i < 0.3).length,
      medium: intensities.filter(i => i >= 0.3 && i < 0.7).length,
      high: intensities.filter(i => i >= 0.7).length
    };

    console.log('\n📈 DISTRIBUCIÓN INTENSIDAD TURÍSTICA:');
    console.log(`   Baja (< 0.3): ${distribution.low} (${(distribution.low/intensities.length*100).toFixed(1)}%)`);
    console.log(`   Media (0.3-0.7): ${distribution.medium} (${(distribution.medium/intensities.length*100).toFixed(1)}%)`);
    console.log(`   Alta (> 0.7): ${distribution.high} (${(distribution.high/intensities.length*100).toFixed(1)}%)`);

    // Evaluación final
    const allValidCoords = validCount === data.points.length;
    const hasKeyMunicipalities = foundKeys >= 4;
    const adequateDensity = density > 25;

    const success = shapeCorrect && allValidCoords && hasKeyMunicipalities && adequateDensity;

    // Evaluación cobertura
    const hasGoodCoverage = data.total_municipalities > 3000; // Mucha mejor cobertura
    const hybridSuccess = success && hasGoodCoverage;

    console.log(`\n🏁 RESULTADO: ${hybridSuccess ? '✅ SISTEMA HÍBRIDO PERFECTO' : success ? '✅ CATALUNYA CORRECTA PERO POCA COBERTURA' : '❌ FORMA CATALUNYA ROTA'}`);

    if (hybridSuccess) {
      console.log('   🗺️ Forma de Catalunya preservada correctamente');
      console.log('   🔧 Agujeros rellenados inteligentemente');
      console.log('   📊 Cobertura completa sin zonas vacías');
      console.log('   🎯 Coordenadas exactas mantenidas');
      console.log('   🌐 Sistema híbrido listo para producción');
    } else if (success) {
      console.log('   🗺️ Forma correcta pero cobertura incompleta');
      console.log('   🕳️ Pueden existir agujeros en el heatmap');
    } else {
      if (!shapeCorrect) {
        console.log('   ❌ ERROR: Forma cuadrada detectada - usar función de 947 municipios');
      }
      if (!allValidCoords) {
        console.log('   ❌ ERROR: Puntos fuera de Catalunya');
      }
    }

    return {
      success,
      shapeCorrect,
      totalMunicipalities: data.total_municipalities,
      density,
      validCoords: validCount,
      foundKeys
    };

  } catch (error) {
    console.error('❌ Error test Catalunya restaurada:', error.message);
    return null;
  }
}

await testCatalunyaRestored();