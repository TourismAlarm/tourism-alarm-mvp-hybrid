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
// la coropleta casa 947/947 por construcción: no hay municipios sin color ni
// nombres inventados.
//
// ── Cómo se calcula la intensidad ───────────────────────────────────────────
//
// No disponemos de población oficial por municipio, así que el índice se apoya
// en dos magnitudes que sí son reales y verificables:
//
//   · densidad = plazas turísticas / km²  → mide saturación del territorio
//   · volumen  = plazas turísticas totales → mide el peso absoluto del destino
//
// Ambas se escalan logarítmicamente contra anclas ABSOLUTAS (no contra el
// máximo observado) para que el índice siga significando lo mismo cuando el
// IDESCAT publique datos nuevos.
//
// La estacionalidad se aplica ANTES de escalar, como una tasa de ocupación:
// las plazas existen todo el año, lo que cambia es cuántas están ocupadas.
// La ocupación de cada mes sale de las pernoctaciones reales de su marca
// turística, normalizadas contra su propio mes punta.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import * as topojson from 'topojson-client';

import { getComarca, getBrand, normalizeId, PROVINCIES } from './lib/comarques.js';
import { readCapacityCsv, readMonthlyStaysByBrand } from './lib/idescat-csv.js';

const GEOJSON_PATH = 'public/geojson/cat-municipis.json';
const OUTPUT_PATH = 'public/data/current.json';

const CAPACITY_SOURCES = {
  hotel: 't6031mun202300.csv',
  camping: 't6036mun202400.csv',
  rural: 't6039mun202400.csv'
};

// Pesos del índice: la densidad manda (es lo que sufre el residente), pero el
// volumen absoluto evita que Barcelona quede infravalorada por su superficie.
const WEIGHT_DENSITY = 0.62;
const WEIGHT_VOLUME = 0.38;

// Anclas absolutas de las escalas logarítmicas.
const DENSITY_FLOOR = 1;      // 1 plaza/km² -> 0
const DENSITY_CEILING = 800;  // 800 plazas/km² -> 1 (Salou real: ~2.450)
const VOLUME_FLOOR = 50;      // 50 plazas -> 0
const VOLUME_CEILING = 25000; // 25.000 plazas -> 1 (Barcelona real: 82.470)

// Ocupación del mes punta de cada marca. El resto de meses se escala contra él.
const PEAK_OCCUPANCY = 0.85;
const MIN_OCCUPANCY = 0.05;

const round = (n, d = 3) => Number(n.toFixed(d));
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function logScore(value, floor, ceiling) {
  if (!(value > floor)) return 0;
  return clamp(Math.log10(value / floor) / Math.log10(ceiling / floor), 0, 1);
}

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
      const ratio = clamp(value / peak, MIN_OCCUPANCY, 1);
      occupancy[brand][month] = round(ratio * PEAK_OCCUPANCY);
    }
  }

  return occupancy;
}

export function categorize(intensity) {
  if (intensity > 0.8) return 'critica';
  if (intensity > 0.6) return 'alta';
  if (intensity > 0.4) return 'media';
  if (intensity > 0.2) return 'moderada';
  return 'baja';
}

async function main() {
  console.log('🗺️  Tourism Alarm — generando datos del mapa\n');

  // ---------------------------------------------------------------- geografía
  const topo = JSON.parse(await readFile(resolve(GEOJSON_PATH), 'utf-8'));
  const collection = topojson.feature(topo, topo.objects.municipis);
  console.log(`📍 Municipios en el TopoJSON: ${collection.features.length}`);

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
    const brandOccupancy = occupancy[brand] || {};

    // Intensidad de los 12 meses: el frontend puede recorrer el año sin
    // volver a pedir datos.
    const monthly = {};
    for (let month = 1; month <= 12; month++) {
      const rate = brandOccupancy[month] ?? PEAK_OCCUPANCY;
      const densityScore = logScore(density * rate, DENSITY_FLOOR, DENSITY_CEILING);
      const volumeScore = logScore(totalPlaces * rate, VOLUME_FLOOR, VOLUME_CEILING);
      monthly[month] = round(clamp(WEIGHT_DENSITY * densityScore + WEIGHT_VOLUME * volumeScore, 0, 1));
    }

    municipalities.push({
      id,
      name: props.nom,
      ...centroidOf(feature.geometry),
      comarca: comarca.name,
      provincia: PROVINCIES[props.provincia] || null,
      brand,
      area_km2: areaKm2,
      hotel_places: hotelPlaces,
      camping_places: campingPlaces,
      rural_places: ruralPlaces,
      total_places: totalPlaces,
      places_per_km2: round(density, 2),
      has_real_data: inCapacityTables && totalPlaces > 0,
      monthly_intensity: monthly
    });
  }

  console.log(`🔗 Municipios cruzados con IDESCAT: ${matched}/${municipalities.length}`);
  console.log(`   Con plazas turísticas registradas: ${municipalities.filter(m => m.has_real_data).length}\n`);

  if (matched < municipalities.length) {
    console.warn(`⚠️  ${municipalities.length - matched} municipios sin fila en los CSV de capacidad`);
  }

  // ------------------------------------------------------------------- salida
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  for (const m of municipalities) {
    m.tourism_intensity = m.monthly_intensity[currentMonth];
    m.categoria = categorize(m.tourism_intensity);
  }

  const distribution = municipalities.reduce((acc, m) => {
    acc[m.categoria] = (acc[m.categoria] || 0) + 1;
    return acc;
  }, {});

  const output = {
    metadata: {
      generated_at: now.toISOString(),
      reference_month: currentMonth,
      total_municipalities: municipalities.length,
      with_real_data: municipalities.filter(m => m.has_real_data).length,
      visualization: 'choropleth',
      version: '3.0',
      sources: [
        'IDESCAT — Places hoteleres per municipis (t6031, 2023)',
        'IDESCAT — Places de càmpings per municipis (t6036, 2024)',
        'IDESCAT — Places de turisme rural per municipis (t6039, 2024)',
        'IDESCAT — Pernoctacions hoteleres mensuals per marca turística (turhot, 2023-2025)',
        'ICGC/IDESCAT — Límits municipals (TopoJSON)'
      ],
      method: {
        density: `log(plazas/km²) entre ${DENSITY_FLOOR} y ${DENSITY_CEILING}, peso ${WEIGHT_DENSITY}`,
        volume: `log(plazas totales) entre ${VOLUME_FLOOR} y ${VOLUME_CEILING}, peso ${WEIGHT_VOLUME}`,
        seasonality: `ocupación estimada = pernoctaciones del mes / mes punta de la marca, × ${PEAK_OCCUPANCY}`
      }
    },
    distribution,
    occupancy_by_brand: occupancy,
    municipalities
  };

  await mkdir(dirname(resolve(OUTPUT_PATH)), { recursive: true });
  await writeFile(resolve(OUTPUT_PATH), JSON.stringify(output), 'utf-8');

  console.log(`📊 Distribución del mes ${currentMonth}:`);
  for (const key of ['critica', 'alta', 'media', 'moderada', 'baja']) {
    console.log(`   ${key.padEnd(9)} ${String(distribution[key] || 0).padStart(4)}`);
  }

  const top = [...municipalities].sort((a, b) => b.tourism_intensity - a.tourism_intensity).slice(0, 10);
  console.log('\n🔝 Top 10 este mes:');
  for (const m of top) {
    console.log(
      `   ${m.name.padEnd(26)} ${(m.tourism_intensity * 100).toFixed(0).padStart(3)}%` +
      `  ${String(m.total_places).padStart(6)} plazas  ${String(m.places_per_km2).padStart(7)}/km²  ${m.brand}`
    );
  }

  console.log(`\n✅ Escrito ${OUTPUT_PATH}`);
}

main().catch(error => {
  console.error('❌ Error generando los datos:', error);
  process.exit(1);
});
