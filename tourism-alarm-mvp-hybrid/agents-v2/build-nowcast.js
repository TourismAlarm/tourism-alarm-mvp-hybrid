#!/usr/bin/env node
// 🔮 Nowcast → data/signals/nowcast-latest.json + data/signals/nowcast/YYYY-MM.ndjson
//
// Junta las dos piezas anteriores y dice, por zona y día:
//
//   afluencia prevista = baseline efectivo × calendario × meteorología
//
// Determinista y sin LLM. Ninguna cifra sale de un modelo de lenguaje: el
// baseline son veinte años de ocupación publicada, el calendario es una tabla
// de pesos documentada y la meteorología viene de Open-Meteo.
//
//   node agents-v2/build-nowcast.js
//   node agents-v2/build-nowcast.js --days=2
//   node agents-v2/build-nowcast.js --dry-run
//
// ─────────────────────────────────────────────────────────────────────────────
// LA TRAMPA QUE HAY QUE EVITAR AQUÍ
//
// baseline.json guarda el GRADO DE OCUPACIÓN tal y como lo publica el IDESCAT,
// que se mide solo sobre los establecimientos ABIERTOS ese mes. En enero, la
// Costa Daurada marca 33%: no es que esté a un tercio, es que el tercio que
// abre está lleno a un tercio. Con solo el 14% de las plazas en
// funcionamiento, la afluencia real es del 3%.
//
//   Costa Daurada    baseline 20 años   abierto   afluencia
//     enero                33%            14%         3%     ← factor 11
//     abril                57%            69%        37%
//     agosto               89%           100%        83%
//
// El mapa ya trabaja en afluencia efectiva desde que se corrigió la ocupación
// del INE. Meter aquí el baseline en crudo reintroduciría ese mismo fallo, y
// multiplicado por once en temporada baja. Por eso el primer paso del nowcast
// es convertir el baseline a las mismas unidades, con la capacidad abierta que
// publica el INE y la misma función ya probada que usa el generador del mapa.
// ─────────────────────────────────────────────────────────────────────────────
//
// NO escribe en current.json. El mapa ya calcula estacional × calendario ×
// meteorología en el navegador, y con 112 puntos de previsión en vez de 12
// zonas, así que sustituirlo por esto sería bajar la resolución. Lo que sí
// aporta el nowcast es un registro fechado de lo que se predijo, que es lo que
// permitirá mañana comparar predicción contra realidad.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { appendChanged } from './lib/archive.js';
import { effectiveOccupancy } from '../scripts/lib/ine.js';
import { occupancyOnDay, clamp } from '../src/lib/pressure.js';
import { calendarFactor, dayOfYear } from '../src/lib/calendar.js';
import { crowdFactor } from '../src/data/weather.js';

const BASELINE_PATH = 'data/signals/baseline.json';
const OCCUPANCY_PATH = 'data/official/occupancy.json';
const WEATHER_PATH = 'data/signals/weather-latest.json';
const OUTPUT_PATH = 'data/signals/nowcast-latest.json';
const ARCHIVE_DIR = 'data/signals/nowcast';

/** Clave de cruce de una fila del histórico: zona y día previsto. */
export const nowcastKey = row => `${row.zone}|${row.date}`;

const pad = n => String(n).padStart(2, '0');
const isoDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Baseline en las mismas unidades que el mapa: ocupación de TODAS las plazas
 * registradas, no solo de las abiertas.
 *
 * La capacidad abierta de cada mes la publica el propio INE, y la corrección
 * la hace la misma función que ya usa el generador del mapa, con sus pruebas.
 */
export function effectiveBaseline(rawMonths, openPlaces) {
  return effectiveOccupancy(rawMonths, openPlaces || {});
}

/**
 * Afluencia prevista de una zona en un día.
 *
 * Tres factores, cada uno de su fuente, y los tres se enseñan por separado
 * para que la cifra final se pueda desmontar.
 */
export function nowcastForDay(curve, date, weather) {
  const seasonal = occupancyOnDay(curve, dayOfYear(date));
  const calendar = calendarFactor(date);
  const crowd = crowdFactor(weather);
  const raw = seasonal * calendar.factor * crowd;

  return {
    date: isoDay(date),
    seasonal: Number(seasonal.toFixed(4)),
    calendar_factor: Number(calendar.factor.toFixed(4)),
    weather_factor: Number(crowd.toFixed(4)),
    expected: Number(clamp(raw, 0, 1).toFixed(4)),
    // La ocupación tiene techo y los tres factores multiplican, así que en
    // punta puede recortarse. Se marca para poder vigilar cuánto pasa: si
    // fuera a menudo, el mapa dejaría de distinguir lleno de llenísimo.
    clamped: raw > 1,
    weekday: calendar.weekdayName,
    reasons: calendar.reasons,
    has_weather: Boolean(weather)
  };
}

async function readJson(path, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(resolve(path), 'utf-8'));
  } catch (error) {
    if (optional) return null;
    throw new Error(`no se pudo leer ${path}: ${error.message}. ` +
      'Ejecuta antes `npm run baseline:build`.');
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}

const percent = value => `${(value * 100).toFixed(0)}%`.padStart(4);

async function main() {
  const args = parseArgs();
  const days = Math.max(1, Math.min(7, Number(args.days) || 2));
  const dryRun = Boolean(args['dry-run']);

  console.log('🔮 Nowcast — baseline × calendario × meteorología\n');

  const baseline = await readJson(BASELINE_PATH);
  const occupancy = await readJson(OCCUPANCY_PATH, { optional: true });
  const weather = await readJson(WEATHER_PATH, { optional: true });

  console.log(`📐 Baseline de ${baseline.generated_at.slice(0, 10)} · ${baseline.zones_live.length} zonas vivas`);

  if (!occupancy) {
    console.warn('⚠️  Sin data/official/occupancy.json: no se puede corregir por');
    console.warn('   capacidad abierta y la temporada baja saldría hasta 11 veces');
    console.warn('   más alta de lo real. Ejecuta `npm run data:official`.');
  }
  console.log(weather
    ? `🌤️  Previsión de ${weather.generated_at.slice(0, 16).replace('T', ' ')} · ${weather.zones_resolved} zonas`
    : '⚠️  Sin data/signals/weather-latest.json: se calcula sin meteorología ' +
      '(ejecuta `npm run collect:weather`)');

  // Solo las zonas que el IDESCAT sigue midiendo. Las descatalogadas tienen
  // curva de hace quince años y no sirven para predecir nada.
  const zones = baseline.zones_live;

  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const horizon = Array.from({ length: days }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return date;
  });

  const zonesOut = {};
  const rows = [];
  let withoutWeather = 0;

  for (const zone of zones) {
    const raw = baseline.zones[zone]?.months;
    if (!raw) continue;

    // El baseline es ocupación hotelera, así que la capacidad abierta de los
    // hoteles es la que corresponde. Pero el INE no publica hoteles en todas
    // las zonas —en Paisatges Barcelona solo hay turismo rural—, y ahí vale
    // más la proporción de otro tipo de alojamiento que no corregir nada: lo
    // que cierra en temporada baja, cierra entero. Sin corrección, esa zona
    // saldría al 43% en noviembre en vez de al 12%.
    const openFrom = ['hotel', 'camping', 'rural']
      .map(type => [type, occupancy?.brands_raw?.[zone]?.[type]?.open_places])
      .find(([, places]) => places && Object.keys(places).length);

    const [openType, openPlaces] = openFrom || [null, null];
    const curve = effectiveBaseline(raw, openPlaces);

    const zoneWeather = weather?.zones?.[zone]?.days;
    const forecast = horizon.map((date, index) => {
      const day = zoneWeather?.[index] ?? null;
      // El colector guarda las derivadas ya calculadas; crowdFactor espera la
      // forma cruda, así que se le devuelve lo que necesita.
      const asRaw = day ? { tempMax: day.temp_max, rain: day.rain_mm, wind: day.wind_kmh } : null;
      if (!asRaw) withoutWeather++;
      return nowcastForDay(curve, date, asRaw);
    });

    zonesOut[zone] = {
      baseline_raw: raw,
      baseline_effective: curve,
      open_capacity_corrected: Boolean(openPlaces),
      open_capacity_from: openType,
      days: forecast
    };

    for (const day of forecast) {
      rows.push({
        run: new Date().toISOString(),
        zone,
        date: day.date,
        expected: day.expected,
        seasonal: day.seasonal,
        calendar_factor: day.calendar_factor,
        weather_factor: day.weather_factor,
        has_weather: day.has_weather,
        clamped: day.clamped
      });
    }
  }

  console.log(`\n📊 Afluencia prevista para el ${horizon[0].toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}:\n`);
  console.log('   zona                     estacional  calendario  tiempo  =  prevista');
  for (const [zone, data] of Object.entries(zonesOut)) {
    const d = data.days[0];
    const flag = !data.open_capacity_corrected
      ? '  ⚠ sin corregir por capacidad abierta'
      : data.open_capacity_from === 'hotel' ? '' : `  (capacidad de ${data.open_capacity_from})`;
    console.log(`   ${zone.padEnd(24)} ${percent(d.seasonal)}       ×${d.calendar_factor.toFixed(2)}     ×${d.weather_factor.toFixed(2)}  =  ${percent(d.expected)}${flag}`);
  }

  const reasons = zonesOut[zones[0]]?.days[0]?.reasons ?? [];
  if (reasons.length) console.log(`\n   (${reasons.join(' · ')})`);
  if (withoutWeather) {
    console.log(`\n⚠️  ${withoutWeather} zona-día sin previsión: ese factor queda en 1,00.`);
  }

  const clamped = rows.filter(row => row.clamped).length;
  if (clamped) {
    console.log(`\n📌 ${clamped} de ${rows.length} zona-día tocan el tope del 100%.`);
  }

  const output = {
    generated_at: new Date().toISOString(),
    horizon_days: days,
    formula: 'afluencia = baseline efectivo (día) × factor de calendario × factor meteorológico',
    inputs: {
      baseline: { path: BASELINE_PATH, generated_at: baseline.generated_at },
      open_capacity: occupancy
        ? { path: OCCUPANCY_PATH, generated_at: occupancy.generated_at }
        : null,
      weather: weather ? { path: WEATHER_PATH, generated_at: weather.generated_at } : null
    },
    notes: {
      units: 'el baseline del IDESCAT mide solo lo abierto; aquí se convierte a ' +
        'ocupación de todas las plazas registradas con la capacidad abierta del INE',
      map: 'no se escribe en current.json: el mapa ya calcula esto en el navegador ' +
        'con 112 puntos de previsión en vez de 12 zonas'
    },
    zones_resolved: Object.keys(zonesOut).length,
    zone_days_without_weather: withoutWeather,
    zone_days_clamped: rows.filter(row => row.clamped).length,
    zones: zonesOut
  };

  if (dryRun) {
    console.log(`\n🔎 Simulación: no se ha escrito nada (${rows.length} filas de archivo omitidas).`);
    return;
  }

  await mkdir(dirname(resolve(OUTPUT_PATH)), { recursive: true });
  await writeFile(resolve(OUTPUT_PATH), JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ Escrito ${OUTPUT_PATH} · ${output.zones_resolved} zonas × ${days} días`);

  if (args['no-archive']) {
    console.log('📁 Archivo histórico omitido (--no-archive).');
    return;
  }

  const { path, added, total } = await appendChanged(ARCHIVE_DIR, rows, { key: nowcastKey });
  console.log(added
    ? `📁 ${path}: +${added} líneas (de ${total}; el resto no había cambiado).`
    : `📁 ${path}: sin novedades, no se añade ninguna línea.`);
}

// Las pruebas importan nowcastForDay(); main() solo corre si se invoca el
// script directamente.
const invokedDirectly = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
