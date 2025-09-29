import { readFile } from 'node:fs/promises';

async function testTransparency() {
    console.log('🌊 TEST DE TRANSPARENCIA Y DENSIDAD CATALUNYA\n');

    try {
        const data = JSON.parse(await readFile('public/data/current.json', 'utf-8'));

        console.log('📊 ANÁLISIS DE DENSIDAD:\n');
        console.log(`Total puntos: ${data.points.length}`);
        console.log(`Target óptimo: < 5,000 puntos para transparencia`);
        console.log(`${data.points.length < 5000 ? '✅' : '❌'} ${data.points.length < 5000 ? 'DENSIDAD ÓPTIMA' : 'DEMASIADOS PUNTOS'}\n`);

        // Verificar intensidades para transparencia
        const intensities = data.points.map(p => p[2]);
        const avgIntensity = intensities.reduce((a,b) => a+b, 0) / intensities.length;
        const maxIntensity = Math.max(...intensities);
        const minIntensity = Math.min(...intensities);

        console.log('🎯 ANÁLISIS DE INTENSIDADES:');
        console.log(`  - Mínima: ${minIntensity.toFixed(3)}`);
        console.log(`  - Máxima: ${maxIntensity.toFixed(3)}`);
        console.log(`  - Promedio: ${avgIntensity.toFixed(3)}`);
        console.log(`  - ${avgIntensity < 0.3 ? '✅' : '❌'} ${avgIntensity < 0.3 ? 'Transparencia adecuada' : 'DEMASIADO OPACO'}`);
        console.log(`  - ${maxIntensity < 0.8 ? '✅' : '❌'} ${maxIntensity < 0.8 ? 'Máximo apropiado' : 'MÁXIMO MUY ALTO'}\n`);

        // Verificar distribución por niveles de intensidad
        const lowIntensity = intensities.filter(i => i <= 0.3).length;
        const mediumIntensity = intensities.filter(i => i > 0.3 && i <= 0.6).length;
        const highIntensity = intensities.filter(i => i > 0.6).length;

        console.log('📈 DISTRIBUCIÓN POR NIVELES:');
        console.log(`  - Baja intensidad (≤0.3): ${lowIntensity} puntos (${(lowIntensity/data.points.length*100).toFixed(1)}%)`);
        console.log(`  - Media intensidad (0.3-0.6): ${mediumIntensity} puntos (${(mediumIntensity/data.points.length*100).toFixed(1)}%)`);
        console.log(`  - Alta intensidad (>0.6): ${highIntensity} puntos (${(highIntensity/data.points.length*100).toFixed(1)}%)`);
        console.log(`  - ${highIntensity < 100 ? '✅' : '❌'} ${highIntensity < 100 ? 'Pocos puntos intensos' : 'DEMASIADOS PUNTOS ROJOS'}\n`);

        // Verificar municipios clave con nueva densidad
        const municipalities = data.municipalities || [];
        const keyMunicipalities = [
            { name: 'Barcelona', expectedMax: 15 },
            { name: 'Girona', expectedMax: 10 },
            { name: 'Tarragona', expectedMax: 10 },
            { name: 'Lleida', expectedMax: 10 },
            { name: 'Sitges', expectedMax: 7 }
        ];

        console.log('🏛️ MUNICIPIOS CLAVE (DENSIDAD REDUCIDA):');
        keyMunicipalities.forEach(({ name, expectedMax }) => {
            const muni = municipalities.find(m => m.name === name);
            if (muni) {
                // Contar puntos cercanos (radio 0.03 grados ~3km)
                const nearbyPoints = data.points.filter(p => {
                    const distance = Math.sqrt(
                        Math.pow(p[0] - muni.lat, 2) +
                        Math.pow(p[1] - muni.lng, 2)
                    );
                    return distance < 0.03;
                });

                const avgIntensity = nearbyPoints.length > 0 ?
                    (nearbyPoints.reduce((sum, p) => sum + p[2], 0) / nearbyPoints.length).toFixed(3) : 0;

                console.log(`  ${name}:`);
                console.log(`    - Puntos cercanos: ${nearbyPoints.length} (esperado ≤${expectedMax})`);
                console.log(`    - Intensidad promedio: ${avgIntensity}`);
                console.log(`    - ${nearbyPoints.length <= expectedMax ? '✅' : '⚠️'} ${nearbyPoints.length <= expectedMax ? 'Densidad correcta' : 'Reducir más'}`);
            } else {
                console.log(`  ❌ ${name}: No encontrado`);
            }
        });

        // Verificar cobertura territorial
        const bounds = {
            north: Math.max(...data.points.map(p => p[0])),
            south: Math.min(...data.points.map(p => p[0])),
            east: Math.max(...data.points.map(p => p[1])),
            west: Math.min(...data.points.map(p => p[1]))
        };

        const coverage = (bounds.north - bounds.south) * (bounds.east - bounds.west);
        const density = data.points.length / coverage;

        console.log(`\n🗺️ COBERTURA TERRITORIAL:`);
        console.log(`  - Norte: ${bounds.north.toFixed(3)}° (${bounds.north < 42.9 ? '✅' : '❌'})`);
        console.log(`  - Sur: ${bounds.south.toFixed(3)}° (${bounds.south > 40.5 ? '✅' : '❌'})`);
        console.log(`  - Este: ${bounds.east.toFixed(3)}° (${bounds.east < 3.4 ? '✅' : '❌'})`);
        console.log(`  - Oeste: ${bounds.west.toFixed(3)}° (${bounds.west > 0.1 ? '✅' : '❌'})`);
        console.log(`  - Área cubierta: ${coverage.toFixed(3)}°²`);
        console.log(`  - Densidad: ${density.toFixed(0)} puntos/°²`);
        console.log(`  - ${coverage > 4.5 ? '✅' : '⚠️'} ${coverage > 4.5 ? 'Cobertura completa' : 'Ampliar cobertura'}`);

        // Análisis de transparencia por zoom simulado
        console.log(`\n🔍 SIMULACIÓN DE TRANSPARENCIA POR ZOOM:`);

        const zoomLevels = [
            { zoom: 7, multiplier: 0.5, name: 'Vista completa Catalunya' },
            { zoom: 9, multiplier: 0.7, name: 'Vista regional' },
            { zoom: 12, multiplier: 1.0, name: 'Vista local' }
        ];

        zoomLevels.forEach(({ zoom, multiplier, name }) => {
            const adjustedAvg = avgIntensity * multiplier;
            const adjustedMax = maxIntensity * multiplier;

            console.log(`  Zoom ${zoom} (${name}):`);
            console.log(`    - Intensidad promedio: ${adjustedAvg.toFixed(3)}`);
            console.log(`    - Intensidad máxima: ${adjustedMax.toFixed(3)}`);
            console.log(`    - ${adjustedMax < 0.6 ? '✅' : '⚠️'} ${adjustedMax < 0.6 ? 'Mapa base visible' : 'Revisar opacidad'}`);
        });

        // Resumen final de transparencia
        console.log(`\n🎯 RESUMEN TRANSPARENCIA:`);
        const transparencyScore = [
            data.points.length < 5000,
            avgIntensity < 0.3,
            maxIntensity < 0.8,
            highIntensity < 100,
            coverage > 4.5
        ].filter(Boolean).length;

        console.log(`  - Puntuación: ${transparencyScore}/5`);

        if (transparencyScore >= 4) {
            console.log(`  - 🎉 TRANSPARENCIA EXCELENTE`);
            console.log(`  - ✅ Mapa base siempre visible`);
            console.log(`  - ✅ Densidad óptima para usabilidad`);
            console.log(`  - ✅ Cobertura completa sin opacidad`);
        } else {
            console.log(`  - ⚠️ NECESITA AJUSTES`);
            console.log(`  - Criterios no cumplidos: ${5 - transparencyScore}`);
        }

        if (data.generation_method) {
            console.log(`\n📋 INFORMACIÓN TÉCNICA:`);
            console.log(`  - Método: ${data.generation_method}`);
            console.log(`  - Optimizado para transparencia: ${data.transparency_optimized ? 'SÍ' : 'NO'}`);
            if (data.optimization_date) {
                console.log(`  - Generado: ${new Date(data.optimization_date).toLocaleString()}`);
            }
        }

    } catch (error) {
        console.error('❌ Error en test de transparencia:', error.message);
        console.log('\n💡 SOLUCIONES:');
        console.log('  - Asegúrate de que existe public/data/current.json');
        console.log('  - Ejecuta primero: npm run fetch:data');
        console.log('  - Verifica que el script de generación esté corregido');
    }
}

testTransparency().catch(console.error);