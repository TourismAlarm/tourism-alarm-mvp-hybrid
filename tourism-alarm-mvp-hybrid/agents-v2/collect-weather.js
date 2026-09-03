#!/usr/bin/env node
// 🌤️ Colector de meteorología por zona turística → data/signals/weather-latest.json
//
// Determinista y sin LLM: pide la previsión a Open-Meteo y la escribe. Con la
// misma previsión de entrada sale exactamente el mismo fichero.
//
// NO está conectado al mapa. Genera una señal aparte; `current.json` no se
// toca. Conectarlo es una decisión posterior, cuando exista el motor de
// baseline.
//
//   node agents-v2/collect-weather.js
//   node agents-v2/collect-weather.js --days=3
//   node agents-v2/collect-weather.js --dry-run   # enseña la tabla, no escribe
//
// Por qué por ZONA y no por municipio: la unidad del histórico es la zona
// turística. El CSV de 2006-2025 (data/dataidescat-csvhistorical-*.csv) trae
// estas doce, y el motor de baseline va a trabajar con ellas, así que la señal
// meteorológica tiene que venir en la misma moneda para poder cruzarlas.
//
// El mapa público sigue pidiendo su propia previsión desde el navegador, con
// 112 puntos, para la ficha de cada municipio. Son cosas distintas: aquella es
// efímera y de detalle; esta es de zona y está pensada para acumularse.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';

// Se reutiliza el cliente del mapa en vez de escribir otro: así la previsión y
// los factores derivados se calculan igual en el navegador y aquí.
import {
  fetchForecast, crowdFactor, beachScore, describeWeather
} from '../src/data/weather.js';

import { COMARQUES } from '../scripts/lib/comarques.js';

const CURRENT_PATH = 'public/data/current.json';
const OUTPUT_PATH = 'data/signals/weather-latest.json';
const BARCELONA_CITY_ID = '80193';

/**
 * Las doce zonas del histórico, definidas por comarca.
 *
 * Ojo: no son nueve. El CSV de 2006-2025 arrastra la nomenclatura antigua, y
 * ahí conviven la marca actual y las que se redefinieron por el camino:
 * "Costa Barcelona" engloba hoy a "Costa Barcelona-Maresme" y "Costa de
 * Garraf", y "Paisatges Barcelona" se llamaba "Catalunya Central". Se
 * publican las doce para poder cruzar cualquier tramo del histórico sin
 * tener que decidir ahora qué se unifica.
 */
const LEGACY_ZONES = {
  'Costa Barcelona-Maresme': ['Maresme'],
  'Costa de Garraf': ['Garraf'],
  'Catalunya Central': ['Anoia', 'Bages', 'Osona', 'Moianès']
};

/** Comarcas de cada marca actual, leídas de la tabla oficial. */
function comarquesByBrand() {
  const byBrand = new Map();
  for (const { name, brand } of Object.values(COMARQUES)) {
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand).push(name);
  }
  return byBrand;
}

export function buildZones() {
  const zones = new Map();

  // Barcelona ciudad va aparte, igual que en las estadísticas del IDESCAT y
  // del INE. No sale de COMARQUES: allí el Barcelonès pertenece a "Costa
  // Barcelona", así que si no se añade a mano la zona no existiría y saldrían
  // once en vez de doce.
  zones.set('Barcelona', []);

  for (const [brand, comarques] of comarquesByBrand()) zones.set(brand, comarques);
  for (const [zone, comarques] of Object.entries(LEGACY_ZONES)) zones.set(zone, comarques);
  return zones;
}

/**
 * Punto de la zona donde se pide la previsión: el centroide de sus municipios
 * ponderado por plazas turísticas.
 *
 * Sin ponderar, el punto de la Costa Brava caería tierra adentro, entre los
 * muchos pueblos pequeños del Gironès, y no en el litoral, que es donde está
 * la gente cuyo tiempo interesa.
 */
export function weightedPoint(municipalities) {
  const usable = municipalities.filter(m => typeof m.lat === 'number' && typeof m.lng === 'number');
  if (!usable.length) return null;

  const totalPlaces = usable.reduce((sum, m) => sum + (m.total_places || 0), 0);
  // Sin plazas registradas en toda la zona, el centroide simple es lo único
  // que queda; no hay nada que ponderar.
  const weightOf = m => (totalPlaces > 0 ? (m.total_places || 0) : 1);
  const weight = usable.reduce((sum, m) => sum + weightOf(m), 0);
  if (!(weight > 0)) return null;

  return {
    lat: Number((usable.reduce((s, m) => s + m.lat * weightOf(m), 0) / weight).toFixed(5)),
    lng: Number((usable.reduce((s, m) => s + m.lng * weightOf(m), 0) / weight).toFixed(5)),
    municipalities: usable.length,
    places: totalPlaces
  };
}

/** Municipios de una zona, por sus comarcas. Barcelona ciudad es zona propia. */
export function municipalitiesOfZone(zone, comarques, all) {
  if (zone === 'Barcelona') {
    return all.filter(m => String(m.id) === BARCELONA_CITY_ID);
  }
  const wanted = new Set(comarques);
  return all.filter(m => wanted.has(m.comarca) && String(m.id) !== BARCELONA_CITY_ID);
}

/** Un día de previsión, ya con las derivadas que consume el mapa. */
export function describeDay(day) {
  if (!day) return null;
  const { label, icon } = describeWeather(day.code);
  return {
    date: day.date,
    code: day.code,
    label,
    icon,
    temp_max: day.tempMax,
    rain_mm: day.rain,
    rain_chance: day.rainChance,
    wind_kmh: day.wind,
    sunshine_hours: day.sunshineHours === null ? null : Number(day.sunshineHours.toFixed(1)),
    // Las mismas funciones que usa el navegador: la señal y el mapa no pueden
    // discrepar sobre qué es un buen día de playa.
    crowd_factor: Number(crowdFactor(day).toFixed(3)),
    beach_score: beachScore(day)
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const days = Math.max(1, Math.min(7, Number(args.days) || 2));
  const dryRun = Boolean(args['dry-run']);

  console.log(`🌤️  Meteorología por zona turística — ${days} día(s)\n`);

  const municipalities = JSON.parse(await readFile(resolve(CURRENT_PATH), 'utf-8')).municipalities;
  const zones = buildZones();

  const entries = [];
  for (const [zone, comarques] of zones) {
    const members = municipalitiesOfZone(zone, comarques, municipalities);
    const point = weightedPoint(members);
    if (!point) {
      console.warn(`⚠️  ${zone}: sin municipios con coordenadas, se omite`);
      continue;
    }
    entries.push({ zone, point });
  }

  console.log(`📍 ${entries.length} zonas con punto de consulta:`);
  for (const { zone, point } of entries) {
    console.log(`   ${zone.padEnd(24)} ${String(point.lat).padStart(8)}, ${String(point.lng).padStart(8)}` +
      `   ${String(point.municipalities).padStart(3)} municipios · ${point.places.toLocaleString('es-ES')} plazas`);
  }

  console.log('\n☁️  Pidiendo la previsión a Open-Meteo…');
  const forecast = await fetchForecast(entries.map(e => e.point), { days });

  const resolved = forecast.filter(Boolean).length;
  if (!resolved) {
    // Sin previsión no se escribe nada: es preferible dejar el fichero
    // anterior intacto a machacarlo con nulos.
    throw new Error('Open-Meteo no ha devuelto previsión para ninguna zona; no se escribe nada');
  }

  const zonesOut = {};
  for (const [index, { zone, point }] of entries.entries()) {
    const raw = forecast[index];
    if (!raw) {
      console.warn(`⚠️  ${zone}: sin previsión`);
      continue;
    }
    zonesOut[zone] = { point, days: raw.map(describeDay).filter(Boolean) };
  }

  const output = {
    generated_at: new Date().toISOString(),
    source: 'Open-Meteo',
    source_url: 'https://open-meteo.com/',
    method: 'previsión diaria en el centroide de cada zona turística, ponderado por plazas',
    horizon_days: days,
    zones_expected: zones.size,
    zones_resolved: Object.keys(zonesOut).length,
    zones: zonesOut
  };

  console.log('\n📊 Previsión de hoy por zona:');
  for (const [zone, data] of Object.entries(zonesOut)) {
    const today = data.days[0];
    if (!today) continue;
    console.log(`   ${zone.padEnd(24)} ${today.icon} ${String(today.temp_max ?? '—').padStart(4)}°` +
      `  lluvia ${String(today.rain_mm ?? '—').padStart(4)} mm` +
      `  viento ${String(today.wind_kmh ?? '—').padStart(4)} km/h` +
      `  afluencia ×${today.crowd_factor}` +
      `  playa ${today.beach_score === null ? '—' : today.beach_score}`);
  }

  if (dryRun) {
    console.log('\n🔎 Simulación: no se ha escrito nada.');
    return;
  }

  await mkdir(dirname(resolve(OUTPUT_PATH)), { recursive: true });
  await writeFile(resolve(OUTPUT_PATH), JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ Escrito ${OUTPUT_PATH} · ${output.zones_resolved}/${output.zones_expected} zonas`);
}

main().catch(error => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
