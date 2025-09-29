import { readFile } from 'node:fs/promises';

// Misma función de validación que en el generador
function isValidCatalunyaLandPoint(lat, lng) {
  // Límites básicos de Catalunya
  if (lat < 40.52 || lat > 42.86 || lng < 0.16 || lng > 3.33) {
    return false;
  }

  // Excluir zonas conocidas del mar Mediterráneo y área francesa

  // Mar al este de la Costa Brava (norte de Girona)
  if (lat > 42.4 && lng > 3.1) return false;

  // Mar al este de Catalunya (general)
  if (lng > 3.2 && lat < 42.0) return false;

  // Mar al sur de Tarragona/Delta del Ebro
  if (lat < 40.6 && lng > 0.8 && lng < 1.5) return false;

  // Zona francesa al norte de los Pirineos
  if (lat > 42.7 && lng < 1.5) return false;

  // Mar al este del Maresme/Barcelona
  if (lat > 41.3 && lat < 41.7 && lng > 2.6) return false;

  // Validaciones adicionales por zonas específicas

  // Costa Brava - evitar puntos muy al este
  if (lat > 41.6 && lat < 42.3 && lng > 3.0) {
    // Solo permitir muy cerca de la costa
    return lng < 3.15;
  }

  // Área metropolitana Barcelona - evitar mar
  if (lat > 41.2 && lat < 41.5 && lng > 2.3) {
    return lng < 2.5;
  }

  // Delta del Ebro - zona compleja
  if (lat < 40.8 && lng > 0.5 && lng < 1.2) {
    // Solo permitir puntos terrestres del delta
    return lat > 40.65;
  }

  return true;
}

async function testNoSeaCoverage() {
    console.log('🌊 TEST DE VALIDACIÓN: SIN COBERTURA EN EL MAR\n');

    try {
        const data = JSON.parse(await readFile('public/data/current.json', 'utf-8'));

        console.log('📊 ANÁLISIS GENERAL:');
        console.log(`  - Total puntos: ${data.points.length}`);
        console.log(`  - Método: ${data.generation_method || 'N/A'}`);
        console.log(`  - Sin grid de fondo: ${data.generation_method === 'municipalities_only_no_grid' ? '✅' : '❌'}`);
        console.log(`  - Protección anti-mar: ${data.no_sea_coverage ? '✅' : '❌'}\n`);

        // Verificar cada punto individualmente
        let validPoints = 0;
        let invalidPoints = 0;
        const seaPoints = [];

        data.points.forEach((point, index) => {
            const [lat, lng, intensity] = point;

            if (isValidCatalunyaLandPoint(lat, lng)) {
                validPoints++;
            } else {
                invalidPoints++;
                seaPoints.push({
                    index,
                    lat: lat.toFixed(4),
                    lng: lng.toFixed(4),
                    intensity: intensity.toFixed(3),
                    reason: getSeaReason(lat, lng)
                });
            }
        });

        console.log('🎯 VALIDACIÓN DE PUNTOS:');
        console.log(`  - Puntos válidos (tierra): ${validPoints}`);
        console.log(`  - Puntos inválidos (mar/extranjero): ${invalidPoints}`);
        console.log(`  - ${invalidPoints === 0 ? '✅' : '❌'} ${invalidPoints === 0 ? 'PERFECTO - Sin puntos en el mar' : 'ERROR - Hay puntos en el mar'}\n`);

        if (seaPoints.length > 0) {
            console.log('❌ PUNTOS PROBLEMÁTICOS:');
            seaPoints.slice(0, 10).forEach(point => {
                console.log(`  ${point.index}: [${point.lat}, ${point.lng}] - ${point.reason}`);
            });
            if (seaPoints.length > 10) {
                console.log(`  ... y ${seaPoints.length - 10} puntos más`);
            }
            console.log('');
        }

        // Verificar distribución por zonas
        console.log('🏖️ ANÁLISIS POR ZONAS COSTERAS:');

        const coastalZones = [
            { name: 'Costa Brava Norte', lat: [42.0, 42.4], lng: [3.0, 3.3] },
            { name: 'Costa Brava Sur', lat: [41.6, 42.0], lng: [2.8, 3.2] },
            { name: 'Maresme', lat: [41.4, 41.6], lng: [2.3, 2.7] },
            { name: 'Barcelona Metro', lat: [41.2, 41.5], lng: [2.0, 2.5] },
            { name: 'Costa Dorada', lat: [40.7, 41.2], lng: [0.7, 1.8] },
            { name: 'Delta del Ebro', lat: [40.5, 40.8], lng: [0.5, 1.2] }
        ];

        coastalZones.forEach(zone => {
            const zonePoints = data.points.filter(p =>
                p[0] >= zone.lat[0] && p[0] <= zone.lat[1] &&
                p[1] >= zone.lng[0] && p[1] <= zone.lng[1]
            );

            const zoneValidPoints = zonePoints.filter(p => isValidCatalunyaLandPoint(p[0], p[1]));
            const zoneInvalidPoints = zonePoints.length - zoneValidPoints.length;

            console.log(`  ${zone.name}:`);
            console.log(`    - Total: ${zonePoints.length} puntos`);
            console.log(`    - Válidos: ${zoneValidPoints.length}`);
            console.log(`    - En mar: ${zoneInvalidPoints}`);
            console.log(`    - ${zoneInvalidPoints === 0 ? '✅' : '❌'} ${zoneInvalidPoints === 0 ? 'Zona limpia' : 'Necesita corrección'}`);
        });

        // Verificar límites extremos
        console.log('\n📍 VERIFICACIÓN DE LÍMITES:');
        const bounds = {
            north: Math.max(...data.points.map(p => p[0])),
            south: Math.min(...data.points.map(p => p[0])),
            east: Math.max(...data.points.map(p => p[1])),
            west: Math.min(...data.points.map(p => p[1]))
        };

        console.log(`  - Norte: ${bounds.north.toFixed(3)}° ${bounds.north <= 42.86 ? '✅' : '❌'}`);
        console.log(`  - Sur: ${bounds.south.toFixed(3)}° ${bounds.south >= 40.52 ? '✅' : '❌'}`);
        console.log(`  - Este: ${bounds.east.toFixed(3)}° ${bounds.east <= 3.33 ? '✅' : '❌'}`);
        console.log(`  - Oeste: ${bounds.west.toFixed(3)}° ${bounds.west >= 0.16 ? '✅' : '❌'}`);

        // Resumen final
        console.log('\n🎯 RESUMEN VALIDACIÓN:');
        const passedTests = [
            invalidPoints === 0,
            bounds.north <= 42.86,
            bounds.south >= 40.52,
            bounds.east <= 3.33,
            bounds.west >= 0.16,
            data.generation_method === 'municipalities_only_no_grid'
        ].filter(Boolean).length;

        console.log(`  - Tests pasados: ${passedTests}/6`);

        if (passedTests === 6) {
            console.log('  - 🎉 VALIDACIÓN COMPLETA EXITOSA');
            console.log('  - ✅ Sin puntos en el mar');
            console.log('  - ✅ Sin grid rectangular');
            console.log('  - ✅ Límites respetados');
            console.log('  - ✅ Solo municipios de Catalunya');
        } else {
            console.log('  - ⚠️ VALIDACIÓN INCOMPLETA');
            console.log(`  - Fallos: ${6 - passedTests}`);
        }

    } catch (error) {
        console.error('❌ Error en validación:', error.message);
        console.log('\n💡 SOLUCIONES:');
        console.log('  - Asegúrate de que existe public/data/current.json');
        console.log('  - Ejecuta: npm run fetch:data');
        console.log('  - Verifica que el grid de fondo esté eliminado');
    }
}

function getSeaReason(lat, lng) {
    if (lat > 42.4 && lng > 3.1) return 'Mar Costa Brava Norte';
    if (lng > 3.2 && lat < 42.0) return 'Mar Mediterráneo Este';
    if (lat < 40.6 && lng > 0.8 && lng < 1.5) return 'Mar sur Tarragona';
    if (lat > 42.7 && lng < 1.5) return 'Territorio francés';
    if (lat > 41.3 && lat < 41.7 && lng > 2.6) return 'Mar Maresme';
    if (lat > 41.6 && lat < 42.3 && lng > 3.15) return 'Mar Costa Brava';
    if (lat > 41.2 && lat < 41.5 && lng > 2.5) return 'Mar Barcelona';
    if (lat < 40.65 && lng > 0.5 && lng < 1.2) return 'Mar Delta Ebro';
    return 'Fuera de límites Catalunya';
}

testNoSeaCoverage().catch(console.error);