#!/usr/bin/env node
// 📥 Descarga de datos oficiales → data/official/occupancy.json
//
// Qué trae, y por qué cada cosa:
//
//   INE, Encuesta de Ocupación (hotelera, campings, turismo rural)
//     · por ZONA turística  → las 9 marcas de Catalunya, cobertura completa.
//     · por PUNTO turístico → ~30 municipios con ocupación propia medida.
//     Es el GRADO DE OCUPACIÓN de verdad. Hasta ahora la aplicación lo
//     deducía de las pernoctaciones del IDESCAT normalizadas contra su mes
//     punta y multiplicadas por 0,85: un proxy con una constante inventada.
//
//   IDESCAT, padró municipal
//     · población de los 947 municipios. Permite dar plazas por habitante,
//       que es el indicador estándar de presión turística y que hasta ahora
//       faltaba (el README lo decía).
//
//   IDESCAT, capacidad 2025
//     · plazas hoteleras, de camping y de turismo rural, un año más nuevas
//       que los CSV del repositorio (2023/2024).
//
// El resultado se versiona: el mapa no depende de que estas APIs respondan
// en cada despliegue. Se refresca desde GitHub Actions (workflow "Datos
// oficiales", modo fetch) una vez por semana.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

import {
  occupancyByBrand, occupancyByMunicipality, buildMunicipalityIndex,
  readPopulationCsv, monthsCovered, normalizeId, effectiveOccupancy
} from '../lib/ine.js';

const INE = 'https://servicios.ine.es/wstempus/js/ES';
const OUT = 'data/official/occupancy.json';
const CURRENT = 'public/data/current.json';
const CAPACITY_DIR = 'data/official/capacity';

// 3 años: suficiente para promediar cada mes sin arrastrar la anomalía de un
// año concreto, y sin descargar una década entera.
const MONTHS = 36;
const TIMEOUT_MS = 180000;
const MAX_BYTES = 64 * 1024 * 1024;

const UA = 'TourismAlarm/1.0 (+https://github.com/TourismAlarm/tourism-alarm-mvp-hybrid)';

// Tablas del INE. Los ids son estables; el sondeo (scripts/official/probe.js)
// los descubrió y quedan documentados aquí.
const ZONE_TABLES = { hotel: 2013, camping: 2049, rural: 2005, apartment: 2022 };
const POINT_TABLES = { hotel: 75198, camping: 75196, apartment: 75193 };

// Capacidad por municipio, edición más reciente publicada.
const CAPACITY_TABLES = { hotel: 6031, camping: 6036, rural: 6039 };
const CAPACITY_YEAR = 2025;

const POPULATION_URL = 'https://www.idescat.cat/pub/?id=pmh&n=446&by=mun&f=csv&lang=ca';

async function download(url, { label, json = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/csv, text/plain' }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = await response.text();
    if (body.length > MAX_BYTES) throw new Error(`respuesta de ${body.length} B, demasiado grande`);

    console.log(`   ${String(body.length).padStart(9)} B  ${Date.now() - started} ms  ${label}`);
    return json ? JSON.parse(body) : body;
  } finally {
    clearTimeout(timer);
  }
}

/** Igual que download, pero un fallo no aborta: devuelve null y lo avisa. */
async function optional(url, options) {
  try {
    return await download(url, options);
  } catch (error) {
    console.warn(`   ⚠️  ${options.label}: ${error.message}`);
    return null;
  }
}

const curvesOf = entry => Object.fromEntries(
  Object.entries(entry).map(([type, value]) => [type, value.curve])
);

async function main() {
  console.log('📥 Datos oficiales — INE + IDESCAT\n');

  const municipalities = JSON.parse(await readFile(resolve(CURRENT), 'utf-8')).municipalities;
  const index = buildMunicipalityIndex(municipalities);
  const nameOf = new Map(municipalities.map(m => [normalizeId(m.id), m.name]));

  // ── ocupación por marca turística ──
  console.log('🏷️  Ocupación por zona turística (INE):');
  const brands = {};
  const brandZones = {};
  // Se guarda también el desglose sin corregir: si mañana hay que revisar la
  // corrección, los dos términos están ahí y no hay que volver a descargar.
  const brandRaw = {};

  for (const [type, table] of Object.entries(ZONE_TABLES)) {
    const series = await optional(`${INE}/DATOS_TABLA/${table}?nult=${MONTHS}&tip=AM`, {
      label: `zonas ${type} (tabla ${table})`
    });
    if (!series) continue;

    // El grado de ocupación solo cuenta lo abierto; la capacidad abierta de
    // cada mes es lo que lo convierte en afluencia. Ver effectiveOccupancy().
    const capacity = occupancyByBrand(series, { concept: 'capacity' });

    for (const [brand, entry] of occupancyByBrand(series)) {
      const open = capacity.get(brand)?.curve || {};
      (brands[brand] ??= {})[type] = effectiveOccupancy(entry.curve, open);
      (brandZones[brand] ??= {})[type] = entry.zone;
      (brandRaw[brand] ??= {})[type] = { occupancy: entry.curve, open_places: open };
    }
  }

  for (const [brand, byType] of Object.entries(brands)) {
    const detail = Object.entries(byType)
      .map(([type, curve]) => `${type} ${monthsCovered(curve)}/12`)
      .join(', ');
    console.log(`      ${brand.padEnd(22)} ${detail}`);
  }

  if (!Object.keys(brands).length) {
    throw new Error('el INE no ha devuelto ocupación de ninguna marca: no se sobrescribe nada');
  }

  // ── ocupación por municipio ──
  console.log('\n📍 Ocupación por punto turístico (INE):');
  const byMunicipality = {};
  const municipalityRaw = {};

  for (const [type, table] of Object.entries(POINT_TABLES)) {
    const series = await optional(`${INE}/DATOS_TABLA/${table}?nult=${MONTHS}&tip=AM`, {
      label: `puntos ${type} (tabla ${table})`
    });
    if (!series) continue;

    const found = occupancyByMunicipality(series, index);
    const capacity = occupancyByMunicipality(series, index, { concept: 'capacity' });
    console.log(`      ${type.padEnd(10)} ${found.size} municipios`);

    for (const [id, entry] of found) {
      const open = capacity.get(id)?.curve || {};
      (byMunicipality[id] ??= { name: nameOf.get(id) })[type] = effectiveOccupancy(entry.curve, open);
      (municipalityRaw[id] ??= {})[type] = { occupancy: entry.curve, open_places: open };
    }
  }

  console.log(`      total: ${Object.keys(byMunicipality).length} municipios con ocupación propia`);
  for (const [id, entry] of Object.entries(byMunicipality)) {
    const types = Object.keys(entry).filter(k => k !== 'name');
    console.log(`        ${(entry.name || id).padEnd(30)} ${types.join(', ')}`);
  }

  // ── población ──
  console.log('\n👥 Padró municipal (IDESCAT):');
  const populationCsv = await optional(POPULATION_URL, { label: 'población por municipio', json: false });
  const population = populationCsv ? readPopulationCsv(populationCsv) : new Map();
  console.log(`      ${population.size} municipios`);

  if (population.size && population.size < 900) {
    throw new Error(`el padró solo trae ${population.size} municipios; se esperaban 947`);
  }

  // ── capacidad más reciente ──
  console.log(`\n🏨 Capacidad ${CAPACITY_YEAR} (IDESCAT):`);
  await mkdir(resolve(CAPACITY_DIR), { recursive: true });

  for (const [type, table] of Object.entries(CAPACITY_TABLES)) {
    const csv = await optional(
      `https://www.idescat.cat/pub/?id=turall&n=${table}&geo=mun&t=${CAPACITY_YEAR}00&f=csv&lang=ca`,
      { label: `plazas ${type} (t${table}, ${CAPACITY_YEAR})`, json: false }
    );
    if (!csv) continue;

    const rows = csv.split(/\r?\n/).filter(line => /^\d{6}[,;]/.test(line)).length;
    if (rows < 900) {
      console.warn(`   ⚠️  plazas ${type}: solo ${rows} municipios, no se guarda`);
      continue;
    }
    await writeFile(resolve(CAPACITY_DIR, `${type}-${CAPACITY_YEAR}.csv`), csv, 'utf-8');
    console.log(`      ${type.padEnd(10)} ${rows} municipios → ${CAPACITY_DIR}/${type}-${CAPACITY_YEAR}.csv`);
  }

  // ── salida ──
  const output = {
    generated_at: new Date().toISOString(),
    months_requested: MONTHS,
    sources: [
      `INE — Encuesta de Ocupación Hotelera, grado de ocupación por plazas, zonas (${ZONE_TABLES.hotel}) y puntos turísticos (${POINT_TABLES.hotel})`,
      `INE — Encuesta de Ocupación en Campings, grado de ocupación por parcelas, zonas (${ZONE_TABLES.camping}) y puntos (${POINT_TABLES.camping})`,
      `INE — Encuesta de Ocupación en Alojamientos de Turismo Rural, zonas (${ZONE_TABLES.rural})`,
      `INE — Encuesta de Ocupación en Apartamentos Turísticos, zonas (${ZONE_TABLES.apartment}) y puntos (${POINT_TABLES.apartment})`,
      'IDESCAT — Padró municipal d\'habitants (població a 1 de gener)'
    ],
    method: {
      occupancy: 'afluencia = grado de ocupación × plazas abiertas del mes / plazas del mes punta; ' +
        'media por mes del año de los últimos 36 meses publicados, en tanto por uno',
      why: 'el grado de ocupación del INE se mide solo sobre lo abierto: en enero Salou tiene ' +
        'la planta hotelera cerrada y un 25% de lo poco abierto no es un 25% del municipio',
      brands: 'zona turística del INE ↔ marca turística del IDESCAT',
      municipalities: 'punto turístico del INE ↔ municipio, por código INE o nombre'
    },
    brand_zones: brandZones,
    brands,
    brands_raw: brandRaw,
    municipalities: byMunicipality,
    municipalities_raw: municipalityRaw,
    population: Object.fromEntries(population)
  };

  await mkdir(dirname(resolve(OUT)), { recursive: true });
  await writeFile(resolve(OUT), JSON.stringify(output, null, 1), 'utf-8');

  console.log(`\n✅ Escrito ${OUT}`);
  console.log(`   ${Object.keys(brands).length} marcas · ${Object.keys(byMunicipality).length} municipios con ocupación propia · ${population.size} con población`);
}

main().catch(error => {
  console.error('❌ Descarga fallida:', error.message);
  process.exit(1);
});
