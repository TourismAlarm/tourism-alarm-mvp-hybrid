import { readFile } from 'node:fs/promises';

async function testMultipointSystem() {
    console.log('🧪 TEST SISTEMA MULTIPUNTO CATALUNYA\n');

    try {
        const data = JSON.parse(await readFile('public/data/current.json', 'utf-8'));

        // Analizar distribución de puntos
        console.log('📊 ANÁLISIS DE DISTRIBUCIÓN:\n');

        // Verificar municipios clave
        const keyMunicipalities = [
            { name: 'Barcelona', expectedMin: 60 },
            { name: 'Girona', expectedMin: 25 },
            { name: 'Tarragona', expectedMin: 25 },
            { name: 'Lleida', expectedMin: 20 },
            { name: 'Sitges', expectedMin: 15 },
            { name: 'Lloret de Mar', expectedMin: 20 },
            { name: 'Salou', expectedMin: 15 }
        ];

        const municipalities = data.municipalities || [];

        keyMunicipalities.forEach(({ name, expectedMin }) => {
            const muni = municipalities.find(m => m.name === name);
            if (muni) {
                // Contar puntos cercanos (radio 0.05 grados ~5km)
                const nearbyPoints = data.points.filter(p => {
                    const distance = Math.sqrt(
                        Math.pow(p[0] - muni.lat, 2) +
                        Math.pow(p[1] - muni.lng, 2)
                    );
                    return distance < 0.05;
                });

                const avgIntensity = nearbyPoints.length > 0 ?
                    (nearbyPoints.reduce((sum, p) => sum + p[2], 0) / nearbyPoints.length).toFixed(2) : 0;

                console.log(`${name}:`);
                console.log(`  - Puntos cercanos: ${nearbyPoints.length}`);
                console.log(`  - Intensidad promedio: ${avgIntensity}`);
                console.log(`  - Población: ${muni.population || 'N/A'}`);
                console.log(`  - Área: ${muni.area_km2 || 'N/A'} km²`);
                console.log(`  - ${nearbyPoints.length >= expectedMin ? '✅' : '⚠️'} ${nearbyPoints.length >= expectedMin ? 'Excelente cobertura' : 'Necesita más puntos'}\n`);
            } else {
                console.log(`❌ ${name}: No encontrado\n`);
            }
        });

        // Estadísticas generales
        console.log('📈 ESTADÍSTICAS GENERALES:');
        console.log(`  - Total municipios: ${municipalities.length}`);
        console.log(`  - Total puntos heatmap: ${data.points.length}`);
        const ratio = municipalities.length > 0 ? (data.points.length / municipalities.length).toFixed(1) : 0;
        console.log(`  - Ratio puntos/municipio: ${ratio}`);
        console.log(`  - ${data.points.length > 10000 ? '✅' : '⚠️'} ${data.points.length > 10000 ? 'Excelente densidad' : 'Densidad mejorable'}`);

        // Verificar distribución de intensidades
        const intensities = data.points.map(p => p[2]);
        const intensityStats = {
            min: Math.min(...intensities),
            max: Math.max(...intensities),
            avg: (intensities.reduce((a,b) => a+b, 0) / intensities.length).toFixed(3),
            median: intensities.sort((a,b) => a-b)[Math.floor(intensities.length/2)].toFixed(3)
        };

        console.log(`\n🎯 DISTRIBUCIÓN DE INTENSIDADES:`);
        console.log(`  - Mínima: ${intensityStats.min}`);
        console.log(`  - Máxima: ${intensityStats.max}`);
        console.log(`  - Promedio: ${intensityStats.avg}`);
        console.log(`  - Mediana: ${intensityStats.median}`);
        console.log(`  - ${intensityStats.max <= 1.0 && intensityStats.min >= 0.1 ? '✅' : '⚠️'} Rango válido (0.1-1.0)`);

        // Verificar cobertura territorial
        const bounds = {
            north: Math.max(...data.points.map(p => p[0])),
            south: Math.min(...data.points.map(p => p[0])),
            east: Math.max(...data.points.map(p => p[1])),
            west: Math.min(...data.points.map(p => p[1]))
        };

        const coverage = (bounds.north - bounds.south) * (bounds.east - bounds.west);
        const density = (data.points.length / coverage).toFixed(0);

        console.log(`\n🗺️ COBERTURA TERRITORIAL:`);
        console.log(`  - Norte: ${bounds.north.toFixed(3)}° (${bounds.north < 42.9 ? '✅' : '❌'})`);
        console.log(`  - Sur: ${bounds.south.toFixed(3)}° (${bounds.south > 40.5 ? '✅' : '❌'})`);
        console.log(`  - Este: ${bounds.east.toFixed(3)}° (${bounds.east < 3.4 ? '✅' : '❌'})`);
        console.log(`  - Oeste: ${bounds.west.toFixed(3)}° (${bounds.west > 0.1 ? '✅' : '❌'})`);
        console.log(`  - Área cubierta: ${coverage.toFixed(3)}°²`);
        console.log(`  - Densidad: ${density} puntos/°²`);
        console.log(`  - ${coverage > 4.5 ? '✅' : '⚠️'} ${coverage > 4.5 ? 'Cobertura completa' : 'Ampliar cobertura'}`);

        // Verificar distribución por provincias/zonas
        console.log(`\n🏛️ DISTRIBUCIÓN POR ZONAS:`);

        const zones = {
            'Barcelona Metro': { lat: [41.2, 41.6], lng: [1.8, 2.5] },
            'Costa Brava': { lat: [41.6, 42.3], lng: [2.8, 3.3] },
            'Pirineos': { lat: [42.0, 42.9], lng: [0.1, 2.0] },
            'Costa Dorada': { lat: [40.5, 41.3], lng: [0.5, 1.8] },
            'Interior Lleida': { lat: [41.3, 42.0], lng: [0.1, 1.5] }
        };

        Object.entries(zones).forEach(([zoneName, zone]) => {
            const zonePoints = data.points.filter(p =>
                p[0] >= zone.lat[0] && p[0] <= zone.lat[1] &&
                p[1] >= zone.lng[0] && p[1] <= zone.lng[1]
            );

            const zoneArea = (zone.lat[1] - zone.lat[0]) * (zone.lng[1] - zone.lng[0]);
            const zoneDensity = (zonePoints.length / zoneArea).toFixed(0);

            console.log(`  ${zoneName}: ${zonePoints.length} puntos (${zoneDensity} puntos/°²)`);
        });

        // Resumen final
        console.log(`\n🎯 RESUMEN OPTIMIZACIÓN:`);
        const success =
            data.points.length > 10000 &&
            coverage > 4.5 &&
            ratio > 10 &&
            bounds.north < 42.9 && bounds.south > 40.5 &&
            bounds.east < 3.4 && bounds.west > 0.1;

        console.log(`  - ${success ? '🎉 OPTIMIZACIÓN EXITOSA' : '⚠️ NECESITA AJUSTES'}`);
        console.log(`  - Puntos totales: ${data.points.length} ${data.points.length > 15000 ? '(Excelente)' : data.points.length > 10000 ? '(Bueno)' : '(Mejorable)'}`);
        console.log(`  - Cobertura sin agujeros: ${coverage > 4.5 ? 'SÍ ✅' : 'NO ❌'}`);
        console.log(`  - Forma Catalunya preservada: ${bounds.north < 42.9 && bounds.south > 40.5 ? 'SÍ ✅' : 'NO ❌'}`);
        console.log(`  - Densidad óptima: ${density > 2000 ? 'SÍ ✅' : 'NO ❌'}`);

        if (data.generation_method) {
            console.log(`  - Método: ${data.generation_method}`);
        }
        if (data.optimization_date) {
            console.log(`  - Generado: ${new Date(data.optimization_date).toLocaleString()}`);
        }

    } catch (error) {
        console.error('❌ Error en test:', error.message);
        console.log('💡 Asegúrate de que exists public/data/current.json');
        console.log('💡 Ejecuta primero: npm run fetch:data');
    }
}

testMultipointSystem().catch(console.error);