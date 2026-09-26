#!/usr/bin/env node
// 🧪 Pruebas del nowcast, contra el baseline y la ocupación reales del repo.
//
// La prueba que más importa es la de unidades: vigila que no vuelva a colarse
// el grado de ocupación en crudo, que en temporada baja se va a once veces lo
// real.

import { readFileSync, existsSync } from 'node:fs';

import { effectiveBaseline, nowcastForDay, nowcastKey } from '../agents-v2/build-nowcast.js';
import { fingerprint, changedRows, archivePath } from '../agents-v2/lib/archive.js';

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

const BASELINE = 'data/signals/baseline.json';
const OCCUPANCY = 'data/official/occupancy.json';

// ────────────────────────────────────────────────── descomposición ─────────

console.log('\n🧪 Descomposición del nowcast');

const flat = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 0.5]));

test('la cifra final es el producto de los tres factores', () => {
  const day = nowcastForDay(flat, new Date('2026-05-20T12:00:00'), null); // miércoles
  const esperado = Number((day.seasonal * day.calendar_factor * day.weather_factor).toFixed(4));
  assert(Math.abs(day.expected - esperado) < 0.0002,
    `${day.expected} ≠ ${day.seasonal} × ${day.calendar_factor} × ${day.weather_factor}`);
});

test('sin previsión, el factor meteorológico es 1 y se dice', () => {
  const day = nowcastForDay(flat, new Date('2026-05-20T12:00:00'), null);
  equal(day.weather_factor, 1);
  equal(day.has_weather, false);
});

test('un día de sol llena y uno de lluvia vacía', () => {
  const fecha = new Date('2026-07-15T12:00:00');
  const sol = nowcastForDay(flat, fecha, { tempMax: 29, rain: 0, wind: 8 });
  const lluvia = nowcastForDay(flat, fecha, { tempMax: 17, rain: 12, wind: 45 });
  assert(sol.weather_factor > 1, `sol ×${sol.weather_factor}`);
  assert(lluvia.weather_factor < 0.8, `lluvia ×${lluvia.weather_factor}`);
  assert(sol.expected > lluvia.expected * 1.4, 'el tiempo debería mover la cifra');
  assert(sol.has_weather && lluvia.has_weather, 'has_weather mal marcado');
});

test('el sábado pesa más que el martes', () => {
  const sabado = nowcastForDay(flat, new Date('2026-05-16T12:00:00'), null);
  const martes = nowcastForDay(flat, new Date('2026-05-19T12:00:00'), null);
  assert(sabado.expected > martes.expected, `sábado ${sabado.expected} vs martes ${martes.expected}`);
  equal(sabado.weekday, 'sábado');
});

test('los festivos se nombran', () => {
  const day = nowcastForDay(flat, new Date('2026-08-15T12:00:00'), null);
  assert(day.reasons.some(r => /Assumpci/.test(r)), `motivos: ${day.reasons}`);
});

test('nunca se sale de 0..1, y el recorte se marca', () => {
  const lleno = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 1]));
  const day = nowcastForDay(lleno, new Date('2026-08-15T12:00:00'), { tempMax: 30, rain: 0, wind: 5 });
  assert(day.expected > 0 && day.expected <= 1, `fuera de rango: ${day.expected}`);
  equal(day.clamped, true, 'un festivo de agosto al 100% tiene que marcarse como recortado');

  const normal = nowcastForDay(flat, new Date('2026-05-20T12:00:00'), null);
  equal(normal.clamped, false, 'un miércoles de mayo al 50% no se recorta');
});

// ───────────────────────────────────────────────────────── unidades ────────

console.log('\n🧪 Unidades: capacidad abierta');

test('un mes con la mitad cerrada vale la mitad', () => {
  const curve = effectiveBaseline({ 1: 0.8, 8: 0.8 }, { 1: 500, 8: 1000 });
  equal(curve[1], 0.4);
  equal(curve[8], 0.8);
});

test('sin capacidad conocida no se inventa una corrección', () => {
  equal(effectiveBaseline({ 8: 0.9 }, null)[8], 0.9);
  equal(effectiveBaseline({ 8: 0.9 }, {})[8], 0.9);
});

if (existsSync(BASELINE) && existsSync(OCCUPANCY)) {
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf-8'));
  const occupancy = JSON.parse(readFileSync(OCCUPANCY, 'utf-8'));

  const openPlacesOf = zone => ['hotel', 'camping', 'rural']
    .map(type => occupancy.brands_raw?.[zone]?.[type]?.open_places)
    .find(places => places && Object.keys(places).length) || null;

  test('el invierno de la costa deja de parecer temporada media', () => {
    // La trampa: el IDESCAT mide solo lo abierto. En enero la Costa Daurada
    // marca 33%, pero con el 14% de las plazas en funcionamiento la afluencia
    // real es del 3-5%. Sin esta corrección el mapa mentiría por un factor 11.
    const raw = baseline.zones['Costa Daurada'].months;
    const curve = effectiveBaseline(raw, openPlacesOf('Costa Daurada'));

    assert(raw[1] > 0.3, `el crudo de enero debería rondar el 33%, es ${raw[1]}`);
    assert(curve[1] < 0.12, `el efectivo de enero sigue en ${curve[1]}: no se ha corregido`);
    assert(raw[1] / curve[1] > 4, `la corrección apenas mueve enero (${raw[1]} → ${curve[1]})`);
  });

  test('agosto no se toca: en verano está todo abierto', () => {
    for (const zone of ['Costa Daurada', 'Costa Brava']) {
      const raw = baseline.zones[zone].months;
      const curve = effectiveBaseline(raw, openPlacesOf(zone));
      assert(Math.abs(curve[8] - raw[8]) < 0.06,
        `${zone}: agosto pasa de ${raw[8]} a ${curve[8]}, no debería moverse apenas`);
    }
  });

  test('la corrección nunca sube una cifra', () => {
    for (const zone of baseline.zones_live) {
      const raw = baseline.zones[zone].months;
      const curve = effectiveBaseline(raw, openPlacesOf(zone));
      for (const [month, value] of Object.entries(curve)) {
        assert(value <= raw[month] + 1e-9,
          `${zone} mes ${month}: ${raw[month]} → ${value}, la corrección no puede subir`);
      }
    }
  });

  test('todas las zonas vivas tienen capacidad abierta con la que corregir', () => {
    const sin = baseline.zones_live.filter(zone => !openPlacesOf(zone));
    equal(sin, [], 'zonas sin corregir');
  });

  test('la estacionalidad sobrevive a la corrección', () => {
    for (const zone of ['Costa Daurada', 'Costa Brava', "Terres de l'Ebre"]) {
      const curve = effectiveBaseline(baseline.zones[zone].months, openPlacesOf(zone));
      assert(curve[8] > curve[1] * 5,
        `${zone}: agosto ${curve[8]} frente a enero ${curve[1]}`);
    }
  });

  test('solo se usan las zonas que el IDESCAT sigue midiendo', () => {
    equal(baseline.zones_live.length, 9, 'zonas vivas');
    for (const muerta of ['Costa de Garraf', 'Costa Barcelona-Maresme', 'Catalunya Central']) {
      assert(!baseline.zones_live.includes(muerta), `${muerta} no debería entrar al nowcast`);
    }
  });
}

// ──────────────────────────────────────────────────────── archivo ──────────

console.log('\n🧪 Archivo histórico');

test('la clave de cruce es zona y día', () => {
  equal(nowcastKey({ zone: 'Costa Brava', date: '2026-09-25' }), 'Costa Brava|2026-09-25');
});

test('la huella ignora la marca de tiempo de la ejecución', () => {
  const a = { run: '2026-09-25T06:00:00Z', zone: 'X', date: '2026-09-25', expected: 0.5 };
  const b = { run: '2026-09-25T18:00:00Z', zone: 'X', date: '2026-09-25', expected: 0.5 };
  equal(fingerprint(a), fingerprint(b), 'dos ejecuciones con el mismo dato');
});

test('solo se archiva lo que cambia', () => {
  const previo = { run: 'a', zone: 'X', date: '2026-09-25', expected: 0.5 };
  const known = new Map([[nowcastKey(previo), fingerprint(previo)]]);

  const igual = [{ run: 'b', zone: 'X', date: '2026-09-25', expected: 0.5 }];
  const distinto = [{ run: 'b', zone: 'X', date: '2026-09-25', expected: 0.7 }];

  equal(changedRows(igual, known, nowcastKey).length, 0, 'lo idéntico no se repite');
  equal(changedRows(distinto, known, nowcastKey).length, 1, 'lo que cambia sí se anota');
});

test('el fichero del histórico es mensual', () => {
  equal(archivePath('data/signals/nowcast', new Date('2026-09-25T12:00:00')),
    'data/signals/nowcast/2026-09.ndjson');
});

console.log(`\n${failed ? '❌' : '✅'} ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed ? 1 : 0);
