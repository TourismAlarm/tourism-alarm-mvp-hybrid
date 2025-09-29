// 🎯 SISTEMA INTELIGENTE MULTIPUNTO - OPTIMIZACIÓN HEATMAP CATALUNYA
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateComplete947Municipalities } from '../data/catalunya-complete.js';

// 🎯 SISTEMA ULTRA REDUCIDO PARA TRANSPARENCIA - MÁXIMO 4000 PUNTOS TOTAL
function calculatePointsForMunicipality(municipality) {
  // ULTRA REDUCIDO - máximo 8 puntos por municipio grande
  let numPoints;

  if (municipality.name === 'Barcelona') {
    numPoints = 8;  // Antes 15, ahora solo 8
  } else if (municipality.population && municipality.population > 100000) {
    numPoints = 5;  // Ciudades grandes (antes 10)
  } else if (municipality.population && municipality.population > 50000) {
    numPoints = 4;  // Ciudades medianas (antes 7)
  } else if (municipality.population && municipality.population > 10000) {
    numPoints = 3;  // Pueblos grandes (antes 5)
  } else {
    numPoints = 2;  // Pueblos pequeños (antes 3)
  }

  // Reducir para municipios menores
  if (!municipality.population || municipality.population < 1000) {
    numPoints = 1;
  }

  return Math.max(1, numPoints); // Mínimo 1 punto
}

// 🎯 GENERAR POCOS PUNTOS CON BAJA INTENSIDAD PARA TRANSPARENCIA
function generatePointsForMunicipality(municipality, numPoints) {
  const points = [];
  const baseRadius = Math.sqrt(municipality.area_km2 || 50) * 0.002; // Radio reducido

  for (let i = 0; i < numPoints; i++) {
    let lat, lng, radiusFactor;

    if (i < numPoints * 0.5) {
      // 50% en centro (núcleo urbano)
      radiusFactor = Math.random() * 0.3;
    } else {
      // 50% disperso
      radiusFactor = 0.3 + Math.random() * 0.5;
    }

    const angle = Math.random() * 2 * Math.PI;
    const distance = baseRadius * radiusFactor;

    lat = municipality.lat + Math.cos(angle) * distance;
    lng = municipality.lng + Math.sin(angle) * distance;

    // Validar que está en Catalunya
    if (lat >= 40.52 && lat <= 42.86 && lng >= 0.16 && lng <= 3.33) {
      // INTENSIDAD REDUCIDA para transparencia
      let finalIntensity = municipality.tourism_intensity * 0.6; // Reducir 40%

      // Máximo 0.8 para zonas muy turísticas
      finalIntensity = Math.min(0.8, finalIntensity);

      // Mínimo 0.15 para visibilidad
      finalIntensity = Math.max(0.15, finalIntensity);

      points.push([lat, lng, finalIntensity]);
    }
  }

  return points;
}

// 🌐 GRID DE FONDO MÍNIMO PARA COBERTURA CON BAJA INTENSIDAD
function addBackgroundGrid(existingPoints) {
  const backgroundPoints = [];

  // Grid muy pequeño: 15x10 puntos para toda Catalunya
  const latStep = (42.86 - 40.52) / 15;
  const lngStep = (3.33 - 0.16) / 10;

  for (let lat = 40.52; lat <= 42.86; lat += latStep) {
    for (let lng = 0.16; lng <= 3.33; lng += lngStep) {
      // Solo añadir si no hay un municipio cerca
      const nearMunicipality = existingPoints.some(p => {
        const distance = Math.sqrt(
          Math.pow(p[0] - lat, 2) +
          Math.pow(p[1] - lng, 2)
        );
        return distance < 0.08; // ~8km de buffer
      });

      if (!nearMunicipality) {
        // Intensidad MUY BAJA para el fondo
        backgroundPoints.push([lat, lng, 0.1]); // Solo 0.1 de intensidad
      }
    }
  }

  console.log(`🌐 Grid de fondo: ${backgroundPoints.length} puntos con intensidad 0.1`);
  return [...existingPoints, ...backgroundPoints];
}

async function generateCatalunyaData() {
  console.log('🎯 Generando sistema TRANSPARENTE de baja densidad...');

  try {
    // Generar datos base con la función restaurada
    const baseData = generateComplete947Municipalities();

    console.log('🧠 Aplicando sistema inteligente multipunto...');

    // Procesar cada municipio con SISTEMA REDUCIDO para transparencia
    const municipalityPoints = [];
    const municipalityStats = [];

    baseData.municipalities.forEach(municipality => {
      // Calcular número REDUCIDO de puntos
      const numPoints = calculatePointsForMunicipality(municipality);

      // Generar POCOS puntos con baja intensidad
      const points = generatePointsForMunicipality(municipality, numPoints);

      municipalityPoints.push(...points);

      municipalityStats.push({
        name: municipality.name,
        points: points.length,
        population: municipality.population || 'N/A',
        area: municipality.area_km2 || 'N/A',
        intensity: municipality.tourism_intensity
      });
    });

    console.log(`📊 Puntos de municipios: ${municipalityPoints.length}`);

    // Añadir grid de fondo para cobertura completa
    const allPoints = addBackgroundGrid(municipalityPoints);

    console.log(`🎯 TOTAL FINAL: ${allPoints.length} puntos (target < 5000)`);

    // Crear datos completos con puntos REDUCIDOS para transparencia
    const completeData = {
      ...baseData,
      points: allPoints,
      generation_method: 'transparent_low_density',
      optimization_date: new Date().toISOString(),
      transparency_optimized: true
    };

    // Estadísticas de TRANSPARENCIA
    const intensities = completeData.points.map(p => p[2]);
    const stats = {
      min: Math.min(...intensities),
      max: Math.max(...intensities),
      avg: (intensities.reduce((a,b) => a+b, 0) / intensities.length).toFixed(3),
      count: intensities.length,
      municipalities: baseData.municipalities.length,
      ratio: (intensities.length / baseData.municipalities.length).toFixed(1)
    };

    console.log('\n📊 ESTADÍSTICAS TRANSPARENCIA OPTIMIZADA:');
    console.log(`   Total puntos: ${stats.count} ${stats.count < 5000 ? '✅ ÓPTIMO' : '❌ DEMASIADOS'}`);
    console.log(`   Total municipios: ${stats.municipalities}`);
    console.log(`   Ratio puntos/municipio: ${stats.ratio}`);
    console.log(`   Intensidad: min=${stats.min}, max=${stats.max}, avg=${stats.avg}`);
    console.log(`   Transparencia: ${stats.avg < 0.3 ? '✅ BUENA' : '❌ MUY OPACO'}`);

    // Estadísticas por municipios clave
    console.log('\n🏛️ MUNICIPIOS CLAVE (REDUCIDOS):');
    const keyMunicipalities = ['Barcelona', 'Girona', 'Tarragona', 'Lleida', 'Sitges'];
    keyMunicipalities.forEach(name => {
      const stat = municipalityStats.find(m => m.name === name);
      if (stat) {
        console.log(`   ${name}: ${stat.points} puntos (antes 60-100, ahora max 15)`);
      }
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

    const coverage = (bounds.north - bounds.south) * (bounds.east - bounds.west);
    console.log(`\n🗺️ COBERTURA:`);
    console.log(`   Área cubierta: ${coverage.toFixed(3)}°²`);
    console.log(`   Densidad: ${(completeData.points.length / coverage).toFixed(0)} puntos/°²`);
    console.log(`   ${coverage > 4.5 ? '✅' : '⚠️'} ${coverage > 4.5 ? 'Cobertura completa' : 'Ampliar cobertura'}`);

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

  console.log('\n✅ Sistema TRANSPARENTE con baja densidad guardado');
  console.log(`📊 ${data.total_municipalities} municipios totales`);
  console.log(`🎯 ${data.points.length} puntos REDUCIDOS (${(data.points.length / data.total_municipalities).toFixed(1)} puntos/municipio)`);
  console.log(`💡 Método: ${data.generation_method}`);
  console.log(`🌐 MAPA BASE VISIBLE - Heatmap transparente`);
  console.log(`${data.points.length < 5000 ? '✅' : '❌'} ${data.points.length < 5000 ? 'Densidad óptima para transparencia' : 'REDUCIR MÁS PUNTOS'}`);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}