#!/usr/bin/env node
// 🗺️ GENERADOR DE DATOS DEL MAPA — Tourism Alarm Catalunya
//
// Construye public/data/current.json cruzando SOLO fuentes reales:
//
//   1. public/geojson/cat-municipis.json      -> los 947 municipios oficiales
//      (código IDESCAT, nombre, comarca, provincia, superficie km²)
//   2. dataidescat-csv/.../t6031mun202300.csv -> plazas hoteleras por municipio
//      dataidescat-csv/.../t6036mun202400.csv -> plazas de camping por municipio
//      dataidescat-csv/.../t6039mun202400.csv -> plazas de turismo rural
//   3. dataidescat-csv/.../idescat-turhot-*.csv -> pernoctaciones mensuales por
//      marca turística (estacionalidad real, 2023-2025)
//
// El identificador de cada municipio es el mismo que el del TopoJSON, así que
// la coropleta casa 947/947 por construcción.
//
// La aplicación muestra HOY y MAÑANA, así que este script NO congela una
// intensidad: publica la capacidad real de cada municipio y la curva de
// ocupación de su marca turística, y el navegador calcula la cifra del día
// aplicando calendario y meteorología. La fórmula vive en src/lib/pressure.js
// y la comparten generador y navegador.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import * as topojson from 'topojson-client';

import { getComarca, getBrand, normalizeId, PROVINCIES } from './lib/comarques.js';
import { readCapacityCsv, readMonthlyStaysByBrand } from './lib/idescat-csv.js';
import { detectCoastalMunicipalities } from './lib/coastline.js';
import {
  PEAK_OCCUPANCY,
  MIN_OCCUPANCY,
  clamp,
  round,
  intensityFor,
  categorize,
  occupancyOnDay,
  daytripAccess
} from '../src/lib/pressure.js';

const GEOJSON_PATH = 'public/geojson/cat-municipis.json';
const OUTPUT_PATH = 'public/data/current.json';

const CAPACITY_SOURCES = {
  hotel: 't6031mun202300.csv',
  camping: 't6036mun202400.csv',
  rural: 't6039mun202400.csv'
};

// Centroide del anillo exterior con más superficie (los municipios con islas o
// enclaves tienen varios polígonos).
function centroidOf(geometry) {
  const polygons = geometry.type === 'MultiPolygon'
    ? geometry.coordinates
    : [geometry.coordinates];

  let best = null;
  let bestArea = -Infinity;

  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;

    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const cross = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      area += cross;
      cx += (ring[j][0] + ring[i][0]) * cross;
      cy += (ring[j][1] + ring[i][1]) * cross;
    }
    area /= 2;

    const absArea = Math.abs(area);
    if (absArea > bestArea) {
      bestArea = absArea;
      best = absArea === 0 ? [ring[0][0], ring[0][1]] : [cx / (6 * area), cy / (6 * area)];
    }
  }

  return best ? { lng: round(best[0], 5), lat: round(best[1], 5) } : { lng: null, lat: null };
}

// Tasa de ocupación estimada por marca y mes, a partir de pernoctaciones reales.
function buildOccupancy(stays) {
  const occupancy = {};

  for (const [brand, monthly] of stays) {
    const peak = Math.max(...Object.values(monthly));
    if (!(peak > 0)) continue;

    occupancy[brand] = {};
    for (let month = 1; month <= 12; month++) {
      const value = monthly[month] ?? 0;
      occupancy[brand][month] = round(clamp(value / peak, MIN_OCCUPANCY, 1) * PEAK_OCCUPANCY);
    }
  }

  return occupancy;
}

/**
 * Puntos para los que se pedirá la previsión meteorológica.
 *
 * Los municipios costeros llevan punto propio: son los que responden a "¿a qué
 * playa voy?" y ahí el tiempo importa al detalle. Los del interior comparten el
 * punto de su comarca, porque la meteorología es un fenómeno regional y así una
 * sola petición cubre todo el mapa.
 */
function buildWeatherPoints(municipalities) {
  const points = [];
  const comarcaPoint = new Map();

  for (const m of municipalities) {
    if (m.lat === null || m.lng === null) continue;

    if (m.coastal) {
      m.weather_point = points.length;
      points.push({ lat: m.lat, lng: m.lng, label: m.name, coastal: true });
      continue;
    }

    if (!comarcaPoint.has(m.comarca)) {
      comarcaPoint.set(m.comarca, { index: points.length, sum: [0, 0], count: 0 });
      points.push({ lat: m.lat, lng: m.lng, label: m.comarca, coastal: false });
    }
    const entry = comarcaPoint.get(m.comarca);
    entry.sum[0] += m.lat;
    entry.sum[1] += m.lng;
    entry.count++;
    m.weather_point = entry.index;
  }

  // El punto de cada comarca pasa a ser el centro de sus municipios.
  for (const entry of comarcaPoint.values()) {
    points[entry.index].lat = round(entry.sum[0] / entry.count, 5);
    points[entry.index].lng = round(entry.sum[1] / entry.count, 5);
  }

  return points;
}

async function main() {
  console.log('🗺️  Tourism Alarm — generando datos del mapa\n');

  // ---------------------------------------------------------------- geografía
  const topo = JSON.parse(await readFile(resolve(GEOJSON_PATH), 'utf-8'));
  const objectName = Object.keys(topo.objects)[0];
  const collection = topojson.feature(topo, topo.objects[objectName]);
  console.log(`📍 Municipios en el TopoJSON: ${collection.features.length}`);

  const { coastal } = detectCoastalMunicipalities(topo, objectName);
  console.log(`🏖️  Municipios costeros detectados: ${coastal.size}`);

  // ---------------------------------------------------------------- capacidad
  const [hotels, campings, rural] = await Promise.all([
    readCapacityCsv(CAPACITY_SOURCES.hotel),
    readCapacityCsv(CAPACITY_SOURCES.camping),
    readCapacityCsv(CAPACITY_SOURCES.rural)
  ]);
  console.log(`🏨 Plazas hoteleras:     ${hotels.values.size} municipios`);
  console.log(`⛺ Plazas de camping:    ${campings.values.size} municipios`);
  console.log(`🏡 Plazas turismo rural: ${rural.values.size} municipios`);

  // ------------------------------------------------------------ estacionalidad
  const { stays, filesRead, periodsRead } = await readMonthlyStaysByBrand();
  const occupancy = buildOccupancy(stays);
  console.log(`📅 Estacionalidad: ${Object.keys(occupancy).length} marcas turísticas`);
  console.log(`   (${periodsRead} periodos mensuales en ${filesRead} ficheros)\n`);

  if (!Object.keys(occupancy).length) {
    throw new Error('No se ha podido leer la estacionalidad de ningún CSV de turhot');
  }

  // ------------------------------------------------------------------ cruce
  const municipalities = [];
  let matched = 0;

  for (const feature of collection.features) {
    const id = normalizeId(feature.id);
    const props = feature.properties || {};
    const comarca = getComarca(props.comarca);
    const brand = getBrand(id, props.comarca);

    const hotelPlaces = hotels.values.get(id) ?? 0;
    const campingPlaces = campings.values.get(id) ?? 0;
    const ruralPlaces = rural.values.get(id) ?? 0;
    const totalPlaces = hotelPlaces + campingPlaces + ruralPlaces;

    const inCapacityTables = hotels.values.has(id) || campings.values.has(id) || rural.values.has(id);
    if (inCapacityTables) matched++;

    const areaKm2 = Number(props.sup) || 0;
    const density = areaKm2 > 0 ? totalPlaces / areaKm2 : 0;
    const centroid = centroidOf(feature.geometry);
    const isCoastal = coastal.has(String(feature.id));

    municipalities.push({
      id,
      name: props.nom,
      ...centroid,
      comarca: comarca.name,
      provincia: PROVINCIES[props.provincia] || null,
      brand,
      coastal: isCoastal,
      // Solo tiene sentido para playas: mide lo fácil que es llegar y volver
      // en el día desde los grandes núcleos urbanos.
      daytrip_access: isCoastal ? round(daytripAccess(centroid.lat, centroid.lng)) : 0,
      area_km2: areaKm2,
      hotel_places: hotelPlaces,
      camping_places: campingPlaces,
      rural_places: ruralPlaces,
      total_places: totalPlaces,
      places_per_km2: round(density, 2),
      has_real_data: inCapacityTables && totalPlaces > 0
    });
  }

  console.log(`🔗 Municipios cruzados con IDESCAT: ${matched}/${municipalities.length}`);
  console.log(`   Con plazas turísticas registradas: ${municipalities.filter(m => m.has_real_data).length}`);
  console.log(`   Costeros: ${municipalities.filter(m => m.coastal).length}\n`);

  if (matched < municipalities.length) {
    console.warn(`⚠️  ${municipalities.length - matched} municipios sin fila en los CSV de capacidad`);
  }

  const weatherPoints = buildWeatherPoints(municipalities);
  console.log(`🌤️  Puntos de previsión meteorológica: ${weatherPoints.length}`);

  // Intensidad mensual de referencia: sin calendario ni meteorología. Sirve de
  // red de seguridad si el navegador no puede calcular nada más.
  for (const m of municipalities) {
    const brandOccupancy = occupancy[m.brand] || {};
    m.monthly_intensity = {};
    for (let month = 1; month <= 12; month++) {
      m.monthly_intensity[month] = intensityFor(m, brandOccupancy[month] ?? PEAK_OCCUPANCY);
    }
  }

  // ------------------------------------------------------------------- salida
  const now = new Date();
  const today = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

  const distribution = municipalities.reduce((acc, m) => {
    const key = categorize(intensityFor(m, occupancyOnDay(occupancy[m.brand], today)));
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const output = {
    metadata: {
      generated_at: now.toISOString(),
      total_municipalities: municipalities.length,
      coastal_municipalities: municipalities.filter(m => m.coastal).length,
      with_real_data: municipalities.filter(m => m.has_real_data).length,
      visualization: 'choropleth',
      version: '4.0',
      horizon: 'hoy y mañana',
      sources: [
        'IDESCAT — Places hoteleres per municipis (t6031, 2023)',
        'IDESCAT — Places de càmpings per municipis (t6036, 2024)',
        'IDESCAT — Places de turisme rural per municipis (t6039, 2024)',
        'IDESCAT — Pernoctacions hoteleres mensuals per marca turística (turhot, 2023-2025)',
        'ICGC/IDESCAT — Límits municipals (TopoJSON)',
        'Open-Meteo — previsión de hoy y mañana (en vivo, desde el navegador)'
      ],
      method: {
        capacity: 'plazas hoteleras + camping + turismo rural por municipio (IDESCAT)',
        seasonality: `ocupación = pernoctaciones del mes / mes punta de la marca, × ${PEAK_OCCUPANCY}`,
        calendar: 'día de la semana y festivos de Catalunya (modelo, media semanal = 1)',
        weather: 'previsión diaria de Open-Meteo (en vivo)'
      }
    },
    distribution,
    // Señales aprobadas que corrigen la estimación. Lo rellena
    // scripts/publish-snapshot.js con lo que haya pasado la revisión; vacío
    // significa "solo modelo", que es un estado válido y honesto.
    signals: { as_of: null, days: {} },
    occupancy_by_brand: occupancy,
    weather_points: weatherPoints,
    municipalities
  };

  await mkdir(dirname(resolve(OUTPUT_PATH)), { recursive: true });
  await writeFile(resolve(OUTPUT_PATH), JSON.stringify(output), 'utf-8');

  console.log('\n📊 Distribución de hoy (sin calendario ni meteorología):');
  for (const key of ['critica', 'alta', 'media', 'moderada', 'baja']) {
    console.log(`   ${key.padEnd(9)} ${String(distribution[key] || 0).padStart(4)}`);
  }

  const top = [...municipalities]
    .map(m => ({ m, i: intensityFor(m, occupancyOnDay(occupancy[m.brand], today)) }))
    .sort((a, b) => b.i - a.i)
    .slice(0, 8);

  console.log('\n🔝 Mayor presión hoy:');
  for (const { m, i } of top) {
    console.log(
      `   ${m.name.padEnd(24)} ${(i * 100).toFixed(0).padStart(3)}%` +
      `  ${String(m.total_places).padStart(6)} plazas  ${m.coastal ? '🏖️ ' : '   '}${m.brand}`
    );
  }

  console.log(`\n✅ Escrito ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error('❌ Error generando los datos:', error);
  process.exit(1);
});
