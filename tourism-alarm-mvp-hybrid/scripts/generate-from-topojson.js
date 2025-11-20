// 🎯 GENERAR CURRENT.JSON DESDE TOPOJSON CON DATOS REALES
// Combina TopoJSON oficial con datos reales de turismo

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as topojson from 'topojson-client';
import { REAL_TOURISM_DATA, TEMPORAL_MULTIPLIERS } from '../data/real-tourism-data.js';

// 📅 Obtener mes actual
function getCurrentMonth() {
  return new Date().getMonth() + 1; // 1-12
}

// 🗺️ Clasificar municipio por geografía
function clasificarMunicipio(code, centroid) {
  // Costa: longitud > 2.4 o latitud baja + longitud media
  if (centroid.lng > 2.4 || (centroid.lat < 41.3 && centroid.lng > 1.0)) {
    return 'costa';
  }

  // Montaña: latitud > 42.1 (Pirineos)
  if (centroid.lat > 42.1) {
    return 'montaña';
  }

  // Ciudad: códigos específicos de capitales
  const ciudades = ['080193', '170792', '431481', '250907', '432038', '081213'];
  if (ciudades.includes(code)) {
    return 'ciudad';
  }

  return 'interior';
}

// 📍 Calcular centroide de geometría
function calculateCentroid(geometry) {
  let sumLat = 0, sumLng = 0, count = 0;

  function processCoords(coords) {
    if (Array.isArray(coords[0])) {
      coords.forEach(c => processCoords(c));
    } else {
      sumLng += coords[0];
      sumLat += coords[1];
      count++;
    }
  }

  processCoords(geometry.coordinates);

  return {
    lat: parseFloat((sumLat / count).toFixed(6)),
    lng: parseFloat((sumLng / count).toFixed(6))
  };
}

// 🧮 Calcular intensidad turística con datos reales
function calculateTourismIntensity(code, categoria) {
  const mes = getCurrentMonth();

  // Si tenemos datos reales, usarlos
  if (REAL_TOURISM_DATA[code]) {
    const realData = REAL_TOURISM_DATA[code];
    let intensity = realData.tourism_intensity;

    // Aplicar multiplicador temporal
    const multiplicador = TEMPORAL_MULTIPLIERS[categoria][mes] || 1.0;
    intensity = intensity * multiplicador;

    // Normalizar a 0.0 - 1.0
    return Math.min(1.0, Math.max(0.0, parseFloat(intensity.toFixed(3))));
  }

  // Si no tenemos datos reales, estimar por categoría
  let intensityBase;

  switch(categoria) {
    case 'costa':
      intensityBase = 0.45; // Costa general
      break;
    case 'montaña':
      intensityBase = 0.30; // Pirineos
      break;
    case 'ciudad':
      intensityBase = 0.25; // Ciudades medianas
      break;
    default:
      intensityBase = 0.15; // Interior rural
  }

  // Aplicar multiplicador temporal
  const multiplicador = TEMPORAL_MULTIPLIERS[categoria][mes] || 1.0;
  let intensity = intensityBase * multiplicador;

  return Math.min(1.0, Math.max(0.05, parseFloat(intensity.toFixed(3))));
}

// 🚀 FUNCIÓN PRINCIPAL
async function main() {
  console.log('🎯 GENERANDO CURRENT.JSON CON DATOS REALES DE TURISMO\n');
  console.log('='.repeat(70));

  const mes = getCurrentMonth();
  const nombreMes = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][mes];

  console.log(`📅 Mes actual: ${nombreMes} (${mes}/12)`);
  console.log(`📊 Municipios con datos reales: ${Object.keys(REAL_TOURISM_DATA).length}`);

  try {
    // Paso 1: Cargar TopoJSON
    console.log('\n📥 Cargando TopoJSON...');
    const topoPath = resolve('public/geojson/cat-municipis.json');
    const topoData = JSON.parse(await readFile(topoPath, 'utf-8'));

    // Paso 2: Convertir a GeoJSON
    console.log('🗺️  Convirtiendo a GeoJSON...');
    const geojson = topojson.feature(topoData, topoData.objects.municipis);

    console.log(`✅ ${geojson.features.length} municipios encontrados`);

    // Paso 3: Procesar cada municipio
    console.log('\n🧮 Procesando municipios con datos reales...');
    const municipios = [];
    const heatmapPoints = [];

    let conDatosReales = 0;
    let estimados = 0;

    geojson.features.forEach((feature, index) => {
      const code = String(feature.id || '000000');
      const name = feature.properties.nom || feature.properties.name || `Municipio ${code}`;

      // Calcular centroide
      const centroid = calculateCentroid(feature.geometry);

      // Clasificar
      const categoria = clasificarMunicipio(code, centroid);

      // Calcular intensidad con datos reales
      const intensity = calculateTourismIntensity(code, categoria);

      // Obtener población y plazas si existen
      const realData = REAL_TOURISM_DATA[code];
      const population = realData?.population || 0;
      const hotelPlaces = realData?.hotel_places || 0;

      if (realData) conDatosReales++;
      else estimados++;

      const municipio = {
        id: code,
        name: name,
        lat: centroid.lat,
        lng: centroid.lng,
        tourism_intensity: intensity,
        population: population,
        hotel_places: hotelPlaces,
        comarca: feature.properties.comarca || '',
        categoria: categoria,
        has_real_data: !!realData
      };

      municipios.push(municipio);
      heatmapPoints.push([centroid.lat, centroid.lng, intensity]);

      // Log progreso
      if ((index + 1) % 100 === 0 || index + 1 === geojson.features.length) {
        console.log(`   [${index + 1}/${geojson.features.length}] Procesado (${conDatosReales} reales, ${estimados} estimados)`);
      }
    });

    // Paso 4: Generar estadísticas
    console.log('\n📊 Generando estadísticas...');
    const intensities = municipios.map(m => m.tourism_intensity);
    const stats = {
      min: Math.min(...intensities).toFixed(3),
      max: Math.max(...intensities).toFixed(3),
      avg: (intensities.reduce((a,b) => a+b, 0) / intensities.length).toFixed(3),
      count: intensities.length,
      with_real_data: conDatosReales,
      estimated: estimados
    };

    // Paso 5: Guardar current.json
    console.log('\n💾 Guardando current.json...');
    const finalData = {
      version: '6.0_real_tourism_data',
      updated_at: new Date().toISOString(),
      source: `${conDatosReales} municipios con datos reales IDESCAT + ${estimados} estimados`,
      method: 'Plazas hoteleras per cápita + multiplicadores temporales',
      current_month: mes,
      current_month_name: nombreMes,
      total_municipalities: municipios.length,
      municipalities_count: municipios.length,
      real_coordinates_count: municipios.length,
      municipalities: municipios,
      points: heatmapPoints,
      statistics: stats
    };

    await writeFile(
      resolve('public/data/current.json'),
      JSON.stringify(finalData, null, 2)
    );

    await writeFile(
      resolve('public/data/last-good.json'),
      JSON.stringify(finalData, null, 2)
    );

    console.log('✅ public/data/current.json creado');
    console.log('✅ public/data/last-good.json actualizado');

    // Resumen final
    console.log('\n' + '='.repeat(70));
    console.log('✅ GENERACIÓN COMPLETADA CON DATOS REALES');
    console.log('='.repeat(70));
    console.log(`📊 Total municipios: ${finalData.total_municipalities}`);
    console.log(`✨ Con datos reales: ${stats.with_real_data}`);
    console.log(`📐 Estimados: ${stats.estimated}`);
    console.log(`📈 Intensidad: min=${stats.min} max=${stats.max} avg=${stats.avg}`);
    console.log(`📅 Ajuste temporal: ${nombreMes} ${mes}/12`);

    // Top 10
    console.log('\n🔝 TOP 10 MUNICIPIOS MÁS TURÍSTICOS (${nombreMes} 2024):');
    const top10 = municipios
      .sort((a, b) => b.tourism_intensity - a.tourism_intensity)
      .slice(0, 10);

    top10.forEach((m, i) => {
      const dataType = m.has_real_data ? '✅' : '📐';
      console.log(`   ${i + 1}. ${dataType} ${m.name.padEnd(28)} ${(m.tourism_intensity * 100).toFixed(0)}% (${m.categoria})`);
    });

    // Distribución
    console.log('\n🎨 DISTRIBUCIÓN DE COLORES:');
    const rojo = municipios.filter(m => m.tourism_intensity > 0.8).length;
    const naranja = municipios.filter(m => m.tourism_intensity > 0.6 && m.tourism_intensity <= 0.8).length;
    const amarillo = municipios.filter(m => m.tourism_intensity > 0.4 && m.tourism_intensity <= 0.6).length;
    const verdeLima = municipios.filter(m => m.tourism_intensity > 0.2 && m.tourism_intensity <= 0.4).length;
    const verde = municipios.filter(m => m.tourism_intensity <= 0.2).length;

    console.log(`   🔴 Rojo (>80%):      ${rojo} municipios`);
    console.log(`   🟠 Naranja (60-80%): ${naranja} municipios`);
    console.log(`   🟡 Amarillo (40-60%): ${amarillo} municipios`);
    console.log(`   🟢 Verde-lima (20-40%): ${verdeLima} municipios`);
    console.log(`   🟢 Verde (<20%):     ${verde} municipios`);

    console.log('\n🎯 PRÓXIMOS PASOS:');
    console.log('   1. npm run build → Compilar para producción');
    console.log('   2. git add . && git commit → Commit cambios');
    console.log('   3. git push && vercel --prod → Deploy a Vercel');
    console.log(`\n💡 Datos actualizados para ${nombreMes}. Los colores reflejan estacionalidad real.`);

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error);
