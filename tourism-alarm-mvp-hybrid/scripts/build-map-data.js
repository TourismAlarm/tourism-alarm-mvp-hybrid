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
import { blendByCapacity, monthsCovered } from './lib/ine.js';
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

// Ocupación oficial del INE y población del IDESCAT, descargadas por
// scripts/official/fetch.js. Si el fichero no está, el mapa se genera igual
// con la estacionalidad deducida de las pernoctaciones: peor, pero funciona.
const OFFICIAL_PATH = 'data/official/occupancy.json';

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

/**
 * Lee la ocupación oficial del INE, si se ha descargado.
 *
 * No se genera en el build porque el INE puede estar caído o lento y el mapa
 * no puede depender de eso: el fichero está versionado y se refresca desde
 * el workflow "Datos oficiales".
 */
async function readOfficial() {
  try {
    const raw = await readFile(resolve(OFFICIAL_PATH), 'utf-8');
    const data = JSON.parse(raw);
    if (!data?.brands || !Object.keys(data.brands).length) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Curva de ocupación de un municipio, mes a mes.
 *
 * El INE no publica los meses en que un establecimiento está cerrado, así que
 * casi ninguna serie tiene los doce: los campings de la Costa Brava cubren de
 * mayo a septiembre y Salou publica de abril a octubre. Descartar esas series
 * por incompletas sería tirar la mejor medición que hay para el verano, que es
 * justo cuando importa.
 *
 * Por eso las capas se rellenan mes a mes, cogiendo para cada uno la mejor
 * disponible:
 *   1. la del propio municipio, si el INE lo trata como punto turístico
 *      (Salou, Lloret, Barcelona…);
 *   2. la de su marca turística, mezclando hotel/camping/rural según las
 *      plazas que ese municipio tiene de cada tipo — un pueblo de campings no
 *      sigue la ocupación de los hoteles;
 *   3. la estacionalidad deducida de las pernoctaciones, que sí tiene los doce
 *      meses y tapa cualquier hueco.
 */
function occupancyForMunicipality(municipality, official, fallback) {
  const places = {
    hotel: municipality.hotel_places,
    camping: municipality.camping_places,
    rural: municipality.rural_places
  };

  const blend = entry => entry
    ? blendByCapacity(
      { hotel: entry.hotel || {}, camping: entry.camping || {}, rural: entry.rural || {} },
      places
    )
    : {};

  const layers = [
    ['municipio', blend(official?.municipalities?.[municipality.id])],
    ['marca', blend(official?.brands?.[municipality.brand])],
    ['pernoctaciones', fallback[municipality.brand] || {}]
  ];

  const curve = {};
  const months = {};

  for (let month = 1; month <= 12; month++) {
    for (const [name, values] of layers) {
      const value = values[month];
      if (typeof value !== 'number') continue;
      curve[month] = round(value);
      months[name] = (months[name] || 0) + 1;
      break;
    }
  }

  // El origen que se enseña es el de la mayoría de los meses. Un municipio con
  // medición propia solo en agosto no puede anunciarse como "medido aquí".
  const source = Object.entries(months).sort((a, b) => b[1] - a[1])[0]?.[0] || 'pernoctaciones';

  return { curve, source, months };
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
  console.log(`📅 Estacionalidad de respaldo: ${Object.keys(occupancy).length} marcas turísticas`);
  console.log(`   (${periodsRead} periodos mensuales en ${filesRead} ficheros)`);

  // ------------------------------------------------------ ocupación oficial
  const official = await readOfficial();
  if (official) {
    console.log(`📊 Ocupación oficial del INE (${official.generated_at.slice(0, 10)}):`);
    console.log(`   ${Object.keys(official.brands).length} marcas, ` +
      `${Object.keys(official.municipalities || {}).length} municipios con dato propio, ` +
      `${Object.keys(official.population || {}).length} con población\n`);
  } else {
    console.warn('⚠️  Sin data/official/occupancy.json: la ocupación sale de las');
    console.warn('   pernoctaciones (proxy). Ejecuta `npm run data:official`.\n');
  }

  if (!Object.keys(occupancy).length) {
    throw new Error('No se ha podido leer la estacionalidad de ningún CSV de turhot');
  }

  // ------------------------------------------------------------------ cruce
  const population = new Map(Object.entries(official?.population || {}));

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
      // Población del padró (IDESCAT). Plazas por habitante es el indicador
      // estándar de presión turística; el índice del mapa sigue usando
      // densidad y volumen, pero la ficha ya puede enseñar la cifra estándar.
      population: population.get(id) ?? null,
      places_per_capita: population.get(id) > 0
        ? round(totalPlaces / population.get(id), 2)
        : null,
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

  // Curva de ocupación de cada municipio y, con ella, la intensidad mensual de
  // referencia (sin calendario ni meteorología: eso lo aplica el navegador).
  const bySource = {};

  let measuredMonths = 0;

  for (const m of municipalities) {
    const { curve, source, months } = occupancyForMunicipality(m, official, occupancy);
    m.occupancy = curve;
    m.occupancy_source = source;
    // Cuántos de los doce meses vienen de una medición del propio municipio:
    // la ficha lo dice, para no vender como medido lo que es de la marca.
    m.occupancy_own_months = months.municipio || 0;
    bySource[source] = (bySource[source] || 0) + 1;
    measuredMonths += (months.municipio || 0) + (months.marca || 0);

    m.monthly_intensity = {};
    for (let month = 1; month <= 12; month++) {
      m.monthly_intensity[month] = intensityFor(m, curve[month] ?? PEAK_OCCUPANCY);
    }
  }

  console.log('📈 Origen de la ocupación de cada municipio:');
  for (const [source, count] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${source.padEnd(16)} ${String(count).padStart(4)}`);
  }
  const totalMonths = municipalities.length * 12;
  console.log(`   ${((measuredMonths / totalMonths) * 100).toFixed(1)}% de los meses-municipio salen de una medición del INE`);

  const ownMeasured = municipalities.filter(m => m.occupancy_own_months > 0);
  console.log(`   ${ownMeasured.length} municipios con algún mes medido en el propio municipio`);

  // ------------------------------------------------------------------- salida
  const now = new Date();
  const today = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);

  const distribution = municipalities.reduce((acc, m) => {
    const key = categorize(intensityFor(m, occupancyOnDay(m.occupancy, today)));
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
      occupancy_sources: bySource,
      official_data_at: official?.generated_at || null,
      sources: [
        'IDESCAT — Places hoteleres per municipis (t6031, 2023)',
        'IDESCAT — Places de càmpings per municipis (t6036, 2024)',
        'IDESCAT — Places de turisme rural per municipis (t6039, 2024)',
        ...(official ? official.sources : ['IDESCAT — Pernoctacions hoteleres mensuals per marca turística (turhot, 2023-2025)']),
        'ICGC/IDESCAT — Límits municipals (TopoJSON)',
        'Open-Meteo — previsión de hoy y mañana (en vivo, desde el navegador)'
      ],
      method: {
        capacity: 'plazas hoteleras + camping + turismo rural por municipio (IDESCAT)',
        occupancy: official
          ? 'grado de ocupación medido del INE, por municipio si lo publica y si no por marca turística, mezclando hotel/camping/rural según las plazas de cada municipio'
          : `proxy: pernoctaciones del mes / mes punta de la marca, × ${PEAK_OCCUPANCY}`,
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
    .map(m => ({ m, i: intensityFor(m, occupancyOnDay(m.occupancy, today)) }))
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
