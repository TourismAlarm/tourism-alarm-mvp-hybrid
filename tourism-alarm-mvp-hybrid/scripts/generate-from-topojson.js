// 🎯 GENERAR CURRENT.JSON DESDE TOPOJSON - Usar 947 municipios reales
// Este script extrae datos del TopoJSON oficial y genera current.json limpio

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import * as topojson from 'topojson-client';

// 📊 Municipios clave con intensidad turística conocida (20 curados manualmente)
const CURATED_INTENSITY = {
  // Costa Brava
  '170235': { name: 'Blanes', intensity: 0.70 },
  '171032': { name: 'Lloret de Mar', intensity: 0.95 },
  '171655': { name: 'Tossa de Mar', intensity: 0.70 },
  '171330': { name: 'Roses', intensity: 0.65 },
  '170854': { name: 'L\'Escala', intensity: 0.60 },
  '080586': { name: 'Cadaqués', intensity: 0.75 },

  // Costa Dorada
  '431713': { name: 'Salou', intensity: 0.85 },
  '430385': { name: 'Cambrils', intensity: 0.60 },

  // Área Barcelona
  '080193': { name: 'Barcelona', intensity: 0.85 },
  '080586': { name: 'Sitges', intensity: 0.90 },

  // Capitales
  '170792': { name: 'Girona', intensity: 0.45 },
  '431481': { name: 'Tarragona', intensity: 0.55 },
  '250907': { name: 'Lleida', intensity: 0.25 },

  // Pirineos
  '251750': { name: 'Puigcerdà', intensity: 0.55 },
  '251027': { name: 'Vielha e Mijaran', intensity: 0.60 }
};

// 🗺️ Obtener comarca desde código INE
function getComarcaFromCode(code) {
  const provincia = code.substring(0, 2);

  const provincias = {
    '08': 'Barcelona',
    '17': 'Girona',
    '25': 'Lleida',
    '43': 'Tarragona'
  };

  return provincias[provincia] || 'Catalunya';
}

// 🧮 Estimar intensidad turística basándose en patrones
function estimateIntensity(municipio, code) {
  // Si está curado, usar ese valor
  if (CURATED_INTENSITY[code]) {
    return CURATED_INTENSITY[code].intensity;
  }

  // Obtener centroide del municipio (promedio de coordenadas)
  const bounds = municipio.geometry.coordinates;
  let avgLat = 0, avgLng = 0, count = 0;

  function processCoords(coords) {
    if (Array.isArray(coords[0])) {
      coords.forEach(c => processCoords(c));
    } else {
      avgLng += coords[0];
      avgLat += coords[1];
      count++;
    }
  }

  processCoords(bounds);
  avgLat /= count;
  avgLng /= count;

  // Detectar zona costera (cerca del mar Mediterráneo)
  const esCosta = avgLng > 2.5 || (avgLat < 41.3 && avgLng > 1.0);

  // Detectar Pirineos (alta latitud)
  const esMontaña = avgLat > 42.2;

  // Detectar grandes ciudades (área aproximada grande)
  const areaAprox = Math.abs(bounds[0][0][0][0] - bounds[0][0][bounds[0][0].length - 1][0]) *
    Math.abs(bounds[0][0][0][1] - bounds[0][0][bounds[0][0].length - 1][1]);

  const esCiudadGrande = areaAprox > 0.1;

  // Asignar intensidad base
  let intensity;

  if (esCosta) {
    intensity = 0.55; // Costa general
  } else if (esMontaña) {
    intensity = 0.35; // Pirineos
  } else if (esCiudadGrande) {
    intensity = 0.30; // Ciudades
  } else {
    intensity = 0.20; // Interior rural
  }

  return parseFloat(intensity.toFixed(3));
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

// 📊 Clasificar municipio
function clasificarMunicipio(code, centroid) {
  // Costa
  const comarcasCosteras = ['Baix Empordà', 'Alt Empordà', 'Selva', 'Maresme', 'Barcelonès',
                             'Baix Llobregat', 'Garraf', 'Baix Penedès', 'Tarragonès',
                             'Baix Camp', 'Baix Ebre', 'Montsià'];

  if (centroid.lng > 2.5 || (centroid.lat < 41.3 && centroid.lng > 1.0)) {
    return 'costa';
  }

  // Montaña
  if (centroid.lat > 42.2) {
    return 'montaña';
  }

  // Provincia
  const prov = code.substring(0, 2);
  if (prov === '08') return 'barcelona';
  if (prov === '17') return 'girona';
  if (prov === '25') return 'lleida';
  if (prov === '43') return 'tarragona';

  return 'interior';
}

// 🚀 FUNCIÓN PRINCIPAL
async function main() {
  console.log('🎯 GENERANDO CURRENT.JSON DESDE TOPOJSON (947 MUNICIPIOS REALES)\n');
  console.log('=' .repeat(70));

  try {
    // Paso 1: Cargar TopoJSON
    console.log('📥 Cargando TopoJSON...');
    const topoPath = resolve('public/geojson/cat-municipis.json');
    const topoData = JSON.parse(await readFile(topoPath, 'utf-8'));

    // Paso 2: Convertir a GeoJSON
    console.log('🗺️  Convirtiendo a GeoJSON...');
    const geojson = topojson.feature(topoData, topoData.objects.municipis);

    console.log(`✅ ${geojson.features.length} municipios encontrados`);

    // Paso 3: Procesar cada municipio
    console.log('\n🧮 Procesando municipios...');
    const municipios = [];
    const heatmapPoints = [];

    geojson.features.forEach((feature, index) => {
      // El ID está en feature.id, no en properties
      const code = String(feature.id || '000000');
      const name = feature.properties.nom || feature.properties.NOM || feature.properties.name || `Municipio ${code}`;

      // Calcular centroide
      const centroid = calculateCentroid(feature.geometry);

      // Estimar intensidad
      const intensity = estimateIntensity(feature, code);

      // Clasificar
      const categoria = clasificarMunicipio(code, centroid);

      const municipio = {
        id: code,
        name: name,
        lat: centroid.lat,
        lng: centroid.lng,
        tourism_intensity: intensity,
        population: 0, // Se actualizará con datos IDESCAT
        comarca: getComarcaFromCode(code),
        categoria: categoria
      };

      municipios.push(municipio);
      heatmapPoints.push([centroid.lat, centroid.lng, intensity]);

      // Log progreso
      if ((index + 1) % 100 === 0 || index + 1 === geojson.features.length) {
        console.log(`   [${index + 1}/${geojson.features.length}] Procesado`);
      }
    });

    // Paso 4: Generar estadísticas
    console.log('\n📊 Generando estadísticas...');
    const intensities = municipios.map(m => m.tourism_intensity);
    const stats = {
      min: Math.min(...intensities).toFixed(3),
      max: Math.max(...intensities).toFixed(3),
      avg: (intensities.reduce((a,b) => a+b, 0) / intensities.length).toFixed(3),
      count: intensities.length
    };

    // Paso 5: Guardar current.json
    console.log('\n💾 Guardando current.json...');
    const finalData = {
      version: '5.0_topojson_clean',
      updated_at: new Date().toISOString(),
      source: 'TopoJSON oficial Catalunya + estimaciones',
      method: 'Centroid calculation + geographic heuristics',
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
    console.log('✅ GENERACIÓN COMPLETADA');
    console.log('='.repeat(70));
    console.log(`📊 Total municipios: ${finalData.total_municipalities}`);
    console.log(`📍 Con coordenadas: ${finalData.real_coordinates_count}`);
    console.log(`📈 Intensity: min=${stats.min} max=${stats.max} avg=${stats.avg}`);

    // Top 10
    console.log('\n🔝 TOP 10 MUNICIPIOS MÁS TURÍSTICOS:');
    const top10 = municipios
      .sort((a, b) => b.tourism_intensity - a.tourism_intensity)
      .slice(0, 10);

    top10.forEach((m, i) => {
      console.log(`   ${i + 1}. ${m.name.padEnd(30)} ${(m.tourism_intensity * 100).toFixed(0)}% (${m.categoria})`);
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
    console.log('   1. npm run dev → Verificar mapa visualmente');
    console.log('   2. npm run build → Compilar para producción');
    console.log('   3. git add . && git commit → Commit cambios');
    console.log('\n💡 Los datos IDESCAT se pueden integrar más tarde para afinar intensidades');

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error);
