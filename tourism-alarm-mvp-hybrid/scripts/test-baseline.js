#!/usr/bin/env node
// 🧪 Pruebas del motor de baseline, contra el histórico real del repositorio.
//
// No hay datos inventados: todo se comprueba sobre
// data/dataidescat-csvhistorical-occupation-2006-2025.csv.csv, que son 236
// meses de ocupación publicada. Si el IDESCAT cambia el formato o alguien
// toca la agregación, estas pruebas fallan y se ve.

import { readFileSync, existsSync } from 'node:fs';

import {
  readHistoricalCsv, monthlyStats, levelFactor, expectedMonths,
  median, percentile, toNumber, isPlaceholderZero, TOTAL_ROW
} from './lib/historical.js';
import { baselineFor } from '../agents-v2/build-baseline.js';
import { dayOfYear } from '../src/lib/calendar.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}\n     ${error.message}`);
    failed++;
  }
}

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b),
  `${m || 'valores distintos'}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

const HISTORICAL = 'data/dataidescat-csvhistorical-occupation-2006-2025.csv.csv';

// ─────────────────────────────────────────────────────────── estadística ───

console.log('\n🧪 Estadística');

test('la coma decimal del IDESCAT se lee bien', () => {
  equal(toNumber('90,2'), 90.2);
  equal(toNumber('1.234,5'), 1234.5);
  equal(toNumber(''), null);
  equal(toNumber('..'), null);
});

test('mediana y percentiles', () => {
  equal(median([1, 2, 3]), 2);
  equal(median([1, 2, 3, 4]), 2.5);
  equal(median([]), null);
  equal(percentile([1, 2, 3, 4], 0.25), 2);
});

test('la mediana aguanta el COVID y la media no', () => {
  // Los agostos reales de Costa Daurada, con 2020 y 2021 hundidos.
  const agostos = [86, 88, 86, 81, 85, 88, 89, 89, 87, 87, 91, 91, 87, 88, 48, 68, 90, 90, 90, 89];
  const media = agostos.reduce((a, b) => a + b, 0) / agostos.length;
  assert(median(agostos) - media > 2.5,
    `la mediana (${median(agostos)}) debería quedar bien por encima de la media (${media.toFixed(1)})`);
});

// ─────────────────────────────────────────────── lectura del histórico ─────

if (!existsSync(HISTORICAL)) {
  console.log(`\n⚠️  No está ${HISTORICAL}: se omiten las pruebas sobre datos reales.\n`);
} else {
  const csv = readFileSync(HISTORICAL, 'utf-8');
  const { series, dropped } = readHistoricalCsv(csv);
  const zones = [...series.keys()].filter(z => z !== TOTAL_ROW);

  console.log('\n🧪 Lectura del histórico real');

  test('lee las doce zonas más el total de Catalunya', () => {
    equal(zones.length, 12, 'zonas');
    assert(series.has(TOTAL_ROW), 'falta la fila del total');
  });

  test('las zonas son las que espera el colector de meteorología', () => {
    for (const zone of ['Barcelona', 'Costa Brava', 'Costa Daurada', 'Costa Barcelona',
      'Pirineus', "Val d'Aran", 'Terres de Lleida', "Terres de l'Ebre",
      'Paisatges Barcelona', 'Catalunya Central', 'Costa de Garraf',
      'Costa Barcelona-Maresme']) {
      assert(series.has(zone), `falta ${zone}`);
    }
  });

  test('todos los valores quedan en 0..1', () => {
    for (const [zone, data] of series) {
      for (const [key, value] of data) {
        assert(value > 0 && value <= 1, `${zone} ${key}: ${value} fuera de rango`);
      }
    }
  });

  test('descarta los ceros de relleno de las zonas descatalogadas', () => {
    // 28 ceros: las tres zonas que el IDESCAT volvió a listar en 2024-2025
    // sin medirlas. Ninguno puede haber sobrevivido a la lectura.
    assert(dropped.placeholderZero >= 20,
      `se esperaban una veintena de ceros de relleno, hubo ${dropped.placeholderZero}`);
    for (const [zone, data] of series) {
      for (const [key, value] of data) {
        assert(value !== 0, `${zone} ${key} ha colado un cero`);
      }
    }
  });

  test('ninguna zona descatalogada queda a cero en temporada', () => {
    // Era el fallo concreto: Costa de Garraf al 0% en abril, mayo y julio.
    for (const zone of ['Costa de Garraf', 'Costa Barcelona-Maresme', 'Catalunya Central']) {
      const { curve } = expectedMonths(series.get(zone), { minSamples: 4 });
      for (const month of [4, 5, 7, 8]) {
        assert(curve[month] > 0.2,
          `${zone} en el mes ${month} sale a ${curve[month]}, señal de que ha colado un cero`);
      }
    }
  });

  test('respeta los estados z y .. como dato ausente', () => {
    assert(dropped.missingStatus > 500, `solo ${dropped.missingStatus} descartes por estado`);
    // Costa Barcelona no existía antes de 2012.
    const cb = series.get('Costa Barcelona');
    for (const key of cb.keys()) {
      assert(Number(key.slice(0, 4)) >= 2012, `Costa Barcelona no debería tener ${key}`);
    }
  });

  // ────────────────────────────────────────────── curva esperada ──────────

  console.log('\n🧪 Curva esperada');

  const curves = new Map(zones.map(z => [z, expectedMonths(series.get(z), { minSamples: 4 })]));

  test('las doce zonas tienen los doce meses', () => {
    for (const [zone, { curve }] of curves) {
      for (let month = 1; month <= 12; month++) {
        assert(typeof curve[month] === 'number', `${zone}: falta el mes ${month}`);
      }
    }
  });

  test('ningún mes se sale de lo posible', () => {
    for (const [zone, { curve }] of curves) {
      for (const [month, value] of Object.entries(curve)) {
        assert(value > 0.1 && value <= 1, `${zone} mes ${month}: ${value}`);
      }
    }
  });

  test('la costa tiene verano y el invierno vacío', () => {
    for (const zone of ['Costa Daurada', 'Costa Brava', "Terres de l'Ebre"]) {
      const { curve } = curves.get(zone);
      assert(curve[8] > curve[1] * 1.8,
        `${zone}: agosto ${curve[8]} no dobla a enero ${curve[1]}`);
    }
  });

  test("Val d'Aran es de esquí: febrero por encima de mayo", () => {
    const { curve } = curves.get("Val d'Aran");
    assert(curve[2] > curve[5] * 1.5,
      `febrero ${curve[2]} debería superar con holgura a mayo ${curve[5]}`);
  });

  test('Barcelona es de ciudad: no se vacía en invierno', () => {
    const { curve } = curves.get('Barcelona');
    assert(curve[1] > 0.45, `enero a ${curve[1]}: demasiado bajo para una ciudad`);
    assert(curve[8] / curve[1] < 2, 'Barcelona no debería tener estacionalidad de playa');
  });

  test('agosto no supera lo que de verdad se midió', () => {
    // La prueba que cazó el fallo: multiplicar la mediana de veinte años por
    // un factor de nivel único daba 99% en la Costa Daurada.
    for (const [zone, { curve }] of curves) {
      const observado = monthlyStats(series.get(zone))[8];
      assert(curve[8] <= observado.max + 0.001,
        `${zone}: agosto esperado ${curve[8]} supera el máximo jamás observado ${observado.max}`);
    }
  });

  test('las zonas descatalogadas no tienen ni un dato posterior', () => {
    // Reaparecen listadas en 2024-2025, pero ahí no hay medición: todo es
    // `z`, `..` o cero de relleno. Su curva tiene que salir de cuando
    // existían de verdad, y nada más.
    for (const [zone, ultimo] of [['Costa de Garraf', 2011],
      ['Costa Barcelona-Maresme', 2011], ['Catalunya Central', 2014]]) {
      const years = [...series.get(zone).keys()].map(k => Number(k.slice(0, 4)));
      assert(Math.max(...years) === ultimo,
        `${zone} llega hasta ${Math.max(...years)}, se esperaba ${ultimo}`);
    }
  });

  test('todas las muestras usadas llegan al mínimo', () => {
    for (const [zone, { samples }] of curves) {
      for (const [month, n] of Object.entries(samples)) {
        assert(n >= 4, `${zone} mes ${month} con solo ${n} muestras`);
      }
    }
  });

  test('una zona con serie continua usa los años recientes', () => {
    const { origin, recent_years } = curves.get('Costa Daurada');
    assert(Object.values(origin).every(o => o === 'reciente'),
      'Costa Daurada tiene veinte años seguidos: no debería tirar del histórico');
    assert(Math.min(...recent_years) >= 2018,
      `la ventana reciente llega hasta ${Math.min(...recent_years)}`);
  });

  test('el nivel es diagnóstico y ya no multiplica la curva', () => {
    const daurada = series.get('Costa Daurada');
    const level = levelFactor(daurada);
    assert(level.factor > 1.05, `se esperaba tendencia al alza, salió ${level.factor}`);
    // Si el factor se aplicara, agosto pasaría del máximo observado.
    const { curve } = expectedMonths(daurada, { minSamples: 4 });
    assert(curve[8] * level.factor > monthlyStats(daurada)[8].max,
      'la prueba ya no vigila nada: revisar');
  });

  // ───────────────────────────────────────────── esperado de un día ───────

  console.log('\n🧪 Esperado de un día concreto');

  const daurada = curves.get('Costa Daurada').curve;

  test('un sábado de agosto supera a un martes de enero', () => {
    const agosto = baselineFor(daurada, new Date('2026-08-15T12:00:00'));
    const enero = baselineFor(daurada, new Date('2026-01-20T12:00:00'));
    assert(agosto.expected > enero.expected * 2,
      `agosto ${agosto.expected} frente a enero ${enero.expected}`);
  });

  test('el fin de semana pesa más que el día laborable', () => {
    const sabado = baselineFor(daurada, new Date('2026-05-16T12:00:00'));
    const martes = baselineFor(daurada, new Date('2026-05-19T12:00:00'));
    assert(sabado.expected > martes.expected, 'el sábado debería salir por encima');
    assert(sabado.weekday === 'sábado' && martes.weekday === 'martes', 'días mal identificados');
  });

  test('los festivos se nombran', () => {
    const asuncion = baselineFor(daurada, new Date('2026-08-15T12:00:00'));
    assert(asuncion.reasons.some(r => /Assumpci/.test(r)), `motivos: ${asuncion.reasons}`);
  });

  test('la curva es continua: sin saltos de un día a otro', () => {
    let peor = 0;
    let previo = baselineFor(daurada, new Date('2026-01-01T12:00:00')).seasonal;
    for (let d = 1; d < 365; d++) {
      const fecha = new Date('2026-01-01T12:00:00');
      fecha.setDate(fecha.getDate() + d);
      const hoy = baselineFor(daurada, fecha).seasonal;
      peor = Math.max(peor, Math.abs(hoy - previo));
      previo = hoy;
    }
    assert(peor < 0.02, `salto de ${(peor * 100).toFixed(1)} puntos entre dos días seguidos`);
  });

  test('el tope del 100% casi nunca se toca', () => {
    // La ocupación tiene techo y el factor de calendario multiplica, así que
    // en punta puede recortarse. Si eso pasara a menudo, el mapa dejaría de
    // distinguir entre lleno y llenísimo y habría que revisar el modelo.
    let topes = 0;
    let total = 0;
    for (const [, { curve }] of curves) {
      for (let d = 0; d < 365; d++) {
        const fecha = new Date('2026-01-01T12:00:00');
        fecha.setDate(fecha.getDate() + d);
        const { seasonal, calendar_factor } = baselineFor(curve, fecha);
        total++;
        if (seasonal * calendar_factor > 1) topes++;
      }
    }
    const ratio = topes / total;
    console.log(`     (${topes} de ${total} zona-día tocan el tope: ${(ratio * 100).toFixed(2)}%)`);
    assert(ratio < 0.02, `el tope se toca en el ${(ratio * 100).toFixed(1)}% de los casos`);
  });

  test('el día del año casa con el calendario', () => {
    equal(dayOfYear(new Date('2026-01-01T12:00:00')), 1);
    equal(dayOfYear(new Date('2026-12-31T12:00:00')), 365);
  });
}

console.log(`\n${failed ? '❌' : '✅'} ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed ? 1 : 0);
