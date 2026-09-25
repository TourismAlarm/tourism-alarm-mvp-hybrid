#!/usr/bin/env node
// 📐 Motor de baseline → data/signals/baseline.json
//
// Responde a una sola pregunta: ¿qué es NORMAL en esta zona este día?
//
// Sin esa referencia, una ocupación del 62% no dice nada. Con ella, dice si
// la Costa Brava está como debería estar un 14 de septiembre o si hay algo
// raro pasando. Es la pieza que convierte una medición en una noticia.
//
// Determinista y sin LLM. Todo sale del histórico del propio repositorio:
// 236 meses de ocupación real, de enero de 2006 a agosto de 2025.
//
//   node agents-v2/build-baseline.js
//   node agents-v2/build-baseline.js --date=2026-08-15   # explica un día
//   node agents-v2/build-baseline.js --dry-run
//
// NO está conectado al mapa. `current.json` no se toca. Juntar esto con la
// señal meteorológica para escribir el nowcast es la pieza siguiente.

import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  readHistoricalCsv, monthlyStats, levelFactor, expectedMonths,
  coveredMonths, TOTAL_ROW, COVID_YEARS
} from '../scripts/lib/historical.js';

// Las mismas funciones que usa el mapa: cómo un mes se vuelve un día, y qué
// pesa un sábado frente a un martes. La referencia y el mapa no pueden
// discrepar en eso.
import { occupancyOnDay } from '../src/lib/pressure.js';
import { calendarFactor, dayOfYear } from '../src/lib/calendar.js';

const HISTORICAL_PATH = 'data/dataidescat-csvhistorical-occupation-2006-2025.csv.csv';
const OUTPUT_PATH = 'data/signals/baseline.json';

// Con menos de esto, la mediana de un mes no significa gran cosa.
const MIN_SAMPLES = 4;

const CURRENT_YEAR = new Date().getFullYear();

/**
 * Ocupación esperada de una zona en una fecha concreta.
 *
 * Tres capas, todas documentadas:
 *   1. la curva mensual del histórico, interpolada al día (forma × nivel);
 *   2. el factor de calendario: día de la semana y festivos de Catalunya;
 *   3. nada más. La meteorología la aporta la otra señal, y el nowcast las
 *      juntará; aquí no se mezcla para que cada pieza siga siendo auditable.
 */
export function baselineFor(curve, date) {
  const seasonal = occupancyOnDay(curve, dayOfYear(date));
  const calendar = calendarFactor(date);
  return {
    seasonal: Number(seasonal.toFixed(4)),
    calendar_factor: Number(calendar.factor.toFixed(4)),
    expected: Number(Math.min(1, seasonal * calendar.factor).toFixed(4)),
    weekday: calendar.weekdayName,
    reasons: calendar.reasons
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

const percent = value => (value === null || value === undefined ? '  —' : `${(value * 100).toFixed(0)}%`.padStart(4));

async function main() {
  const args = parseArgs();
  const dryRun = Boolean(args['dry-run']);

  console.log('📐 Motor de baseline — histórico de ocupación 2006-2025\n');

  const csv = await readFile(resolve(HISTORICAL_PATH), 'utf-8');
  const { series, dropped } = readHistoricalCsv(csv);

  console.log(`📖 ${series.size} filas leídas del histórico`);
  console.log(`   descartados: ${dropped.missingStatus} sin dato (z/..), ` +
    `${dropped.placeholderZero} ceros de relleno, ${dropped.unparsable} ilegibles`);

  if (dropped.placeholderZero) {
    console.log('   (los ceros son de las zonas descatalogadas que el IDESCAT');
    console.log('    volvió a listar en 2024-2025 sin medirlas — ver historical.js)');
  }

  const zonesOut = {};
  const warnings = [];

  for (const [zone, zoneSeries] of series) {
    if (zone === TOTAL_ROW) continue;

    const stats = monthlyStats(zoneSeries);
    // El nivel ya no multiplica nada: se guarda como diagnóstico, para poder
    // decir "esta zona está un 12% por encima de su propia historia".
    const level = levelFactor(zoneSeries);
    const { curve, origin, samples, recent_years } = expectedMonths(zoneSeries, {
      minSamples: MIN_SAMPLES
    });

    const thin = Object.entries(samples)
      .filter(([, n]) => n < MIN_SAMPLES)
      .map(([month]) => Number(month));

    const missing = [];
    for (let month = 1; month <= 12; month++) if (curve[month] === undefined) missing.push(month);

    if (missing.length) warnings.push(`${zone}: sin dato en los meses ${missing.join(', ')}`);
    if (thin.length) warnings.push(`${zone}: menos de ${MIN_SAMPLES} años en los meses ${thin.join(', ')}`);

    const years = [...new Set([...zoneSeries.keys()].map(k => Number(k.slice(0, 4))))].sort();
    const lastYear = years.at(-1) ?? null;

    // Zona descatalogada: el IDESCAT dejó de medirla. Costa de Garraf, Costa
    // Barcelona-Maresme y Catalunya Central se absorbieron en 2012 y 2015, y
    // aunque vuelven a aparecer listadas en 2024-2025, ahí no hay ni una
    // medición: todo es `z`, `..` o cero de relleno. Su curva es la de cuando
    // existían, y quien la lea tiene que saberlo.
    const stale = lastYear !== null && lastYear < CURRENT_YEAR - 2;
    if (stale) {
      warnings.push(`${zone}: descatalogada, la curva es de ${years[0]}-${lastYear}`);
    }

    zonesOut[zone] = {
      months: curve,
      month_origin: origin,
      month_samples: samples,
      stats,
      level,
      stale,
      coverage: {
        months_with_data: coveredMonths(curve),
        observations: zoneSeries.size,
        years_from: years[0] ?? null,
        years_to: lastYear,
        recent_years,
        thin_months: thin,
        missing_months: missing
      }
    };
  }

  console.log(`\n🗺️  ${Object.keys(zonesOut).length} zonas con curva esperada:\n`);
  console.log('   zona                       ene  feb  mar  abr  may  jun  jul  ago  sep  oct  nov  dic   nivel   obs');
  for (const [zone, data] of Object.entries(zonesOut)) {
    const row = Array.from({ length: 12 }, (_, i) => percent(data.months[i + 1])).join(' ');
    const shift = (data.level.factor - 1) * 100;
    const trend = `${shift >= 0 ? '+' : ''}${shift.toFixed(0)}%`;
    const fallback = Object.values(data.month_origin).filter(o => o === 'histórico').length;
    const nota = data.stale
      ? `  ⚠ descatalogada (${data.coverage.years_from}-${data.coverage.years_to})`
      : fallback ? `  ${fallback} mes(es) del histórico largo` : '';
    console.log(`   ${zone.padEnd(24)} ${row}  ${trend.padStart(5)}  ${String(data.coverage.observations).padStart(4)}${nota}`);
  }

  if (warnings.length) {
    console.log('\n⚠️  Avisos:');
    for (const warning of warnings) console.log(`   ${warning}`);
  }

  // Un día concreto, para poder comprobar a mano que la cifra tiene sentido.
  const probe = args.date ? new Date(`${args.date}T12:00:00`) : new Date();
  if (!Number.isNaN(probe.getTime())) {
    console.log(`\n📅 Esperado para el ${probe.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}:`);
    for (const [zone, data] of Object.entries(zonesOut)) {
      const b = baselineFor(data.months, probe);
      const why = b.reasons.length ? `  (${b.reasons.join(' · ')})` : '';
      console.log(`   ${zone.padEnd(24)} estacional ${percent(b.seasonal)}  × calendario ${b.calendar_factor.toFixed(2)}  =  ${percent(b.expected)}${why}`);
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    source: "IDESCAT — Grau d'ocupació hotelera per marques turístiques, 2006-2025",
    source_file: HISTORICAL_PATH,
    method: {
      shape: 'mediana por mes del año de los últimos 8 años con dato, excluyendo 2020-2021; si un mes no llega a 4 muestras recientes, se cae a la mediana de los veinte años',
      level: 'diagnóstico, NO se aplica: cuánto se ha movido la zona respecto a su propia historia',
      expected: 'curva mensual interpolada al día (coseno, igual que el mapa) × factor de calendario (día de la semana y festivos)',
      excluded: 'ceros de relleno de las zonas descatalogadas; valores con estado z o ..'
    },
    covid_years_excluded_from_level: [...COVID_YEARS],
    min_samples: MIN_SAMPLES,
    zones_resolved: Object.keys(zonesOut).length,
    // Las zonas que el IDESCAT sigue midiendo. Es la lista que debe usar el
    // nowcast; las descatalogadas solo sirven para leer historia vieja.
    zones_live: Object.entries(zonesOut).filter(([, z]) => !z.stale).map(([name]) => name),
    zones_stale: Object.entries(zonesOut).filter(([, z]) => z.stale).map(([name]) => name),
    warnings,
    zones: zonesOut
  };

  if (dryRun) {
    console.log('\n🔎 Simulación: no se ha escrito nada.');
    return;
  }

  await mkdir(dirname(resolve(OUTPUT_PATH)), { recursive: true });
  await writeFile(resolve(OUTPUT_PATH), JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ Escrito ${OUTPUT_PATH} · ${output.zones_resolved} zonas`);
}

// Las pruebas importan baselineFor(); main() solo corre si se invoca el
// script directamente.
const invokedDirectly = process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
