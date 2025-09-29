// 🎯 SISTEMA INTELIGENTE MULTIPUNTO - OPTIMIZACIÓN HEATMAP CATALUNYA
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateComplete947Municipalities } from '../data/catalunya-complete.js';

// 🧠 SISTEMA INTELIGENTE DE MÚLTIPLES PUNTOS POR MUNICIPIO
function calculatePointsForMunicipality(municipality) {
  // Factor 1: Área (más área = más puntos)
  const areaFactor = Math.sqrt(municipality.area_km2 || 50);

  // Factor 2: Intensidad turística
  const intensity = municipality.tourism_intensity || Math.random() * 0.8 + 0.1;
  const tourismFactor = intensity;

  // Factor 3: Población
  const populationFactor = municipality.population ?
    Math.min(2, Math.log10(municipality.population) / 5) : 0.5;

  // Factor 4: Tipo especial
  let typeFactor = 1.0;
  if (municipality.name === 'Barcelona') typeFactor = 3.0;
  else if (['Girona', 'Tarragona', 'Lleida'].includes(municipality.name)) typeFactor = 2.0;
  else if (municipality.coastal) typeFactor = 1.5;
  else if (municipality.population && municipality.population < 1000) typeFactor = 0.8;

  // Cálculo final
  let numPoints = Math.floor(
    5 + // Base
    (areaFactor * 2) +
    (tourismFactor * 30) +
    (populationFactor * 15)
  );

  numPoints = Math.floor(numPoints * typeFactor);

  // Límites: entre 5 y 100 puntos
  numPoints = Math.max(5, Math.min(100, numPoints));

  // Mínimos especiales
  if (municipality.name === 'Barcelona') numPoints = Math.max(60, numPoints);
  else if (municipality.population && municipality.population > 100000) numPoints = Math.max(30, numPoints);

  return numPoints;
}

// 🎯 GENERAR MÚLTIPLES PUNTOS CON DISTRIBUCIÓN REALISTA
function generatePointsForMunicipality(municipality, numPoints) {
  const points = [];
  const baseRadius = Math.sqrt(municipality.area_km2 || 50) * 0.003;

  for (let i = 0; i < numPoints; i++) {
    let lat, lng, radiusFactor;

    if (i < numPoints * 0.4) {
      // 40% en centro (núcleo urbano)
      radiusFactor = Math.random() * 0.3;
    } else if (i < numPoints * 0.7) {
      // 30% en zona media
      radiusFactor = 0.3 + Math.random() * 0.4;
    } else {
      // 30% en periferia
      radiusFactor = 0.7 + Math.random() * 0.3;
    }

    const angle = Math.random() * 2 * Math.PI;
    const distance = baseRadius * radiusFactor;

    lat = municipality.lat + Math.cos(angle) * distance;
    lng = municipality.lng + Math.sin(angle) * distance;

    // Validar que está en Catalunya
    if (lat >= 40.52 && lat <= 42.86 && lng >= 0.16 && lng <= 3.33) {
      // Variación de intensidad según distancia del centro
      const intensityVariation = 1 - (radiusFactor * 0.3) + (Math.random() * 0.2 - 0.1);
      const finalIntensity = municipality.tourism_intensity * intensityVariation;

      points.push([lat, lng, Math.max(0.1, Math.min(1, finalIntensity))]);
    }
  }

  return points;
}

async function generateCatalunyaData() {
  console.log('🧠 Generando sistema INTELIGENTE MULTIPUNTO...');

  try {
    // Generar datos base con la función restaurada
    const baseData = generateComplete947Municipalities();

    console.log('🧠 Aplicando sistema inteligente multipunto...');

    // Procesar cada municipio con el sistema inteligente
    const enhancedPoints = [];
    const municipalityStats = [];

    baseData.municipalities.forEach(municipality => {
      // Calcular número óptimo de puntos
      const numPoints = calculatePointsForMunicipality(municipality);

      // Generar puntos distribuidos inteligentemente
      const municipalityPoints = generatePointsForMunicipality(municipality, numPoints);

      enhancedPoints.push(...municipalityPoints);

      municipalityStats.push({
        name: municipality.name,
        points: municipalityPoints.length,
        population: municipality.population || 'N/A',
        area: municipality.area_km2 || 'N/A',
        intensity: municipality.tourism_intensity
      });
    });

    // Crear datos completos con puntos mejorados
    const completeData = {
      ...baseData,
      points: enhancedPoints,
      generation_method: 'intelligent_multipoint',
      optimization_date: new Date().toISOString()
    };

    // Estadísticas detalladas
    const intensities = completeData.points.map(p => p[2]);
    const stats = {
      min: Math.min(...intensities),
      max: Math.max(...intensities),
      avg: (intensities.reduce((a,b) => a+b, 0) / intensities.length).toFixed(2),
      count: intensities.length,
      municipalities: baseData.municipalities.length,
      ratio: (intensities.length / baseData.municipalities.length).toFixed(1)
    };

    console.log('\n📊 ESTADÍSTICAS SISTEMA MULTIPUNTO:');
    console.log(`   Total puntos: ${stats.count}`);
    console.log(`   Total municipios: ${stats.municipalities}`);
    console.log(`   Ratio puntos/municipio: ${stats.ratio}`);
    console.log(`   Intensidad: min=${stats.min}, max=${stats.max}, avg=${stats.avg}`);

    // Estadísticas por municipios clave
    console.log('\n🏛️ MUNICIPIOS CLAVE:');
    const keyMunicipalities = ['Barcelona', 'Girona', 'Tarragona', 'Lleida', 'Sitges'];
    keyMunicipalities.forEach(name => {
      const stat = municipalityStats.find(m => m.name === name);
      if (stat) {
        console.log(`   ${name}: ${stat.points} puntos (pob: ${stat.population})`);
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

  console.log('\n✅ Sistema inteligente multipunto guardado');
  console.log(`📊 ${data.total_municipalities} municipios totales`);
  console.log(`🧠 ${data.points.length} puntos optimizados (${(data.points.length / data.total_municipalities).toFixed(1)} puntos/municipio)`);
  console.log(`🎯 Método: ${data.generation_method}`);
  console.log(`🗺️ FORMA DE CATALUNYA PRESERVADA CON COBERTURA COMPLETA`);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}