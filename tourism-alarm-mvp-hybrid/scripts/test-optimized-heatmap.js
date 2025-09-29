// 🧪 Test optimizaciones avanzadas heatmap Catalunya
import { readFile } from 'node:fs/promises';

async function testOptimizedHeatmap() {
  try {
    console.log('🧪 TESTING OPTIMIZACIONES AVANZADAS HEATMAP\n');

    const data = JSON.parse(await readFile('public/data/current.json', 'utf-8'));
    const points = data.points;

    console.log('📊 DATOS ORIGINALES:');
    console.log(`   Puntos: ${points.length}`);

    // Test 1: Análisis rango de intensidades
    const intensities = points.map(p => p[2]);
    const minIntensity = Math.min(...intensities);
    const maxIntensity = Math.max(...intensities);
    const avgIntensity = (intensities.reduce((a,b) => a+b, 0) / intensities.length);

    console.log(`   Rango intensidad: ${minIntensity.toFixed(3)} - ${maxIntensity.toFixed(3)}`);
    console.log(`   Promedio: ${avgIntensity.toFixed(3)}`);

    // Test 2: Validación coordenadas Catalunya
    const CATALUNYA_BOUNDS = {
        north: 42.86, south: 40.52,
        east: 3.33, west: 0.16
    };

    let validCoords = 0;
    let invalidCoords = [];

    points.forEach((point, index) => {
        const [lat, lng] = point;
        if (lat >= CATALUNYA_BOUNDS.south && lat <= CATALUNYA_BOUNDS.north &&
            lng >= CATALUNYA_BOUNDS.west && lng <= CATALUNYA_BOUNDS.east) {
            validCoords++;
        } else {
            invalidCoords.push({ index, lat, lng });
        }
    });

    console.log(`\n🗺️ VALIDACIÓN COORDENADAS:`);
    console.log(`   Válidas Catalunya: ${validCoords}/${points.length} (${(validCoords/points.length*100).toFixed(1)}%)`);
    if (invalidCoords.length > 0) {
        console.log(`   ⚠️ Coordenadas fuera Catalunya: ${invalidCoords.length}`);
        invalidCoords.slice(0, 3).forEach(coord => {
            console.log(`      - Punto ${coord.index}: [${coord.lat}, ${coord.lng}]`);
        });
    }

    // Test 3: Simulación normalización
    const normalizedData = points.map(point => {
        const [lat, lng, intensity] = point;
        const normalized = (intensity - minIntensity) / (maxIntensity - minIntensity);
        const enhanced = Math.pow(normalized, 0.7); // Gamma correction
        return [lat, lng, enhanced];
    });

    const normalizedIntensities = normalizedData.map(p => p[2]);
    const normalizedMin = Math.min(...normalizedIntensities);
    const normalizedMax = Math.max(...normalizedIntensities);
    const normalizedAvg = (normalizedIntensities.reduce((a,b) => a+b, 0) / normalizedIntensities.length);

    console.log(`\n🔧 DESPUÉS DE NORMALIZACIÓN:`);
    console.log(`   Rango: ${normalizedMin.toFixed(3)} - ${normalizedMax.toFixed(3)}`);
    console.log(`   Promedio: ${normalizedAvg.toFixed(3)}`);

    // Test 4: Simulación boost Barcelona
    const BARCELONA_BOUNDS = {
        north: 41.469, south: 41.320,
        east: 2.228, west: 2.052
    };

    let barcelonaPoints = 0;
    const boostedData = normalizedData.map(point => {
        const [lat, lng, intensity] = point;

        if (lat >= BARCELONA_BOUNDS.south && lat <= BARCELONA_BOUNDS.north &&
            lng >= BARCELONA_BOUNDS.west && lng <= BARCELONA_BOUNDS.east) {
            barcelonaPoints++;
            return [lat, lng, Math.min(intensity * 1.3, 1.0)];
        }
        return point;
    });

    console.log(`\n🏙️ BOOST BARCELONA:`);
    console.log(`   Puntos en área metropolitana: ${barcelonaPoints}`);
    console.log(`   Boost aplicado: +30%`);

    // Test 5: Distribución final por intensidad
    const finalIntensities = boostedData.map(p => p[2]);
    const distribution = {
        low: finalIntensities.filter(i => i < 0.3).length,
        medium: finalIntensities.filter(i => i >= 0.3 && i < 0.7).length,
        high: finalIntensities.filter(i => i >= 0.7).length
    };

    console.log(`\n📈 DISTRIBUCIÓN FINAL:`);
    console.log(`   Baja intensidad (< 0.3): ${distribution.low} puntos (${(distribution.low/points.length*100).toFixed(1)}%)`);
    console.log(`   Media intensidad (0.3-0.7): ${distribution.medium} puntos (${(distribution.medium/points.length*100).toFixed(1)}%)`);
    console.log(`   Alta intensidad (> 0.7): ${distribution.high} puntos (${(distribution.high/points.length*100).toFixed(1)}%)`);

    // Test 6: Configuración recomendada
    console.log(`\n⚙️ CONFIGURACIÓN RECOMENDADA:`);
    console.log(`   Radius: 30px (territorio ~32,000 km²)`);
    console.log(`   Blur: 20px (cobertura territorial)`);
    console.log(`   MaxZoom: 12 (evita sobre-intensificación)`);
    console.log(`   MinOpacity: 0.4 (visibilidad garantizada)`);

    // Test 7: Evaluación optimización
    const optimization_score = (
        (validCoords / points.length) * 0.4 +                    // 40% coordenadas válidas
        (distribution.medium / points.length) * 0.3 +            // 30% distribución equilibrada
        (barcelonaPoints > 0 ? 0.2 : 0) +                       // 20% presencia Barcelona
        (normalizedMax > 0.8 ? 0.1 : 0)                         // 10% rango dinámico
    );

    console.log(`\n🏁 EVALUACIÓN OPTIMIZACIÓN:`);
    console.log(`   Score: ${(optimization_score * 100).toFixed(1)}%`);

    if (optimization_score > 0.8) {
        console.log(`   ✅ EXCELENTE - Heatmap optimizado para Catalunya`);
    } else if (optimization_score > 0.6) {
        console.log(`   ✅ BUENO - Optimización funcional`);
    } else {
        console.log(`   ⚠️ MEJORABLE - Revisar configuración`);
    }

    return {
        score: optimization_score,
        validCoords: validCoords,
        barcelonaPoints: barcelonaPoints,
        distribution: distribution
    };

  } catch (error) {
    console.error('❌ Error testing optimizations:', error.message);
    return null;
  }
}

await testOptimizedHeatmap();