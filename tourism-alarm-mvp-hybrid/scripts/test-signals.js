#!/usr/bin/env node
// 🧪 Pruebas de la lógica de señales.
//
// Comprueba lo que de verdad importa: que una medición real corrija la
// estimación, que envejezca, que los eventos sumen con tope y que nunca se
// presente una estimación como si fuera un dato observado.

import { applySignals, validateSignal, trustForAge, SignalError } from '../src/lib/signals.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function throws(name, fn, expected) {
  try {
    fn();
    check(name, false, 'no lanzó excepción');
  } catch (error) {
    check(name, error instanceof SignalError && error.message.includes(expected),
      `mensaje: ${error.message}`);
  }
}

// Salou: mucha capacidad y mucha densidad.
const salou = { id: '439057', total_places: 37027, places_per_km2: 2452.12 };
const HOY = '2026-08-18';
const AHORA = new Date('2026-08-18T12:00:00Z').getTime();

const hoursAgo = h => new Date(AHORA - h * 3600000).toISOString();

const occupancySignal = (value, hours, method = 'measured') => ({
  source_id: 'ayuntamiento-salou',
  municipality_id: '439057',
  metric: 'occupancy',
  valid_for: HOY,
  value,
  method,
  source_url: 'https://example.org/ocupacion',
  observed_at: hoursAgo(hours),
  dedup_key: `salou-${hours}-${value}`
});

console.log('\n🧪 Validación (sin procedencia no hay señal)');
throws('medida sin source_url se rechaza',
  () => validateSignal({ ...occupancySignal(0.6, 1), source_url: null }),
  'source_url');
throws('valor fuera de rango se rechaza',
  () => validateSignal({ ...occupancySignal(1.5, 1) }),
  'fuera de rango');
throws('método inventado se rechaza',
  () => validateSignal({ ...occupancySignal(0.6, 1), method: 'adivinado' }),
  'method inválido');
throws('sin dedup_key se rechaza',
  () => validateSignal({ ...occupancySignal(0.6, 1), dedup_key: null }),
  'dedup_key');
check('señal completa se acepta', validateSignal(occupancySignal(0.6, 1)) !== null);
check('derivada sin source_url se acepta',
  validateSignal({ ...occupancySignal(0.6, 1), method: 'derived', source_url: null }) !== null);

console.log('\n🧪 Sin señales: todo sigue como antes');
const base = applySignals(salou, 0.85, [], AHORA);
check('la ocupación no cambia', base.occupancy === 0.85);
check('se etiqueta como estimado', base.confidence === 'estimated',
  `confidence = ${base.confidence}`);

console.log('\n🧪 Medición reciente: manda sobre el modelo');
const fresh = applySignals(salou, 0.85, [occupancySignal(0.40, 2)], AHORA);
check('la ocupación baja a la medida', fresh.occupancy === 0.4,
  `ocupación = ${fresh.occupancy}`);
check('se etiqueta como medido', fresh.confidence === 'measured',
  `confidence = ${fresh.confidence}`);
check('la intensidad baja respecto a la estimada', fresh.intensity < base.intensity,
  `${fresh.intensity} vs ${base.intensity}`);
check('guarda la base para poder comparar', fresh.provenance.base === 0.85);
check('guarda el enlace de la fuente',
  fresh.provenance.sources[0].url === 'https://example.org/ocupacion');

console.log('\n🧪 Envejecimiento: una medición vieja deja de mandar');
check('a 2 h la confianza es total', trustForAge(hoursAgo(2), AHORA) === 1);
const dayOld = trustForAge(hoursAgo(24), AHORA);
check('a 24 h la confianza baja', dayOld > 0.3 && dayOld < 1, `confianza = ${dayOld}`);
check('a 72 h se queda en el suelo', trustForAge(hoursAgo(72), AHORA) === 0.3);

const stale = applySignals(salou, 0.85, [occupancySignal(0.40, 72)], AHORA);
check('la vieja se mezcla con la base', stale.occupancy > 0.4 && stale.occupancy < 0.85,
  `ocupación = ${stale.occupancy}`);
check('y ya no se llama medido', stale.confidence === 'partial',
  `confidence = ${stale.confidence}`);

console.log('\n🧪 Eventos: suman, con tope, y nunca pasan de 1');
const event = (name, impact, i) => ({
  source_id: 'agenda',
  municipality_id: '439057',
  metric: 'event',
  valid_for: HOY,
  value: null,
  method: 'measured',
  source_url: 'https://example.org/agenda',
  observed_at: hoursAgo(3),
  payload: { name, impact },
  dedup_key: `evt-${i}`
});

const withEvent = applySignals(salou, 0.50, [event('Festa Major', 'alto', 1)], AHORA);
check('un evento sube la ocupación', withEvent.occupancy > 0.5,
  `ocupación = ${withEvent.occupancy}`);
check('el evento aparece en la procedencia',
  withEvent.provenance.events[0].name === 'Festa Major');
check('sin medición, un evento deja el dato en mixto',
  withEvent.confidence === 'partial', `confidence = ${withEvent.confidence}`);

const manyEvents = applySignals(salou, 0.50,
  Array.from({ length: 8 }, (_, i) => event(`Evento ${i}`, 'alto', i)), AHORA);
check('el aporte de eventos tiene tope', manyEvents.provenance.uplift <= 0.35,
  `uplift = ${manyEvents.provenance.uplift}`);
check('la ocupación nunca pasa de 1', manyEvents.occupancy <= 1,
  `ocupación = ${manyEvents.occupancy}`);

const saturated = applySignals(salou, 0.98,
  Array.from({ length: 5 }, (_, i) => event(`Evento ${i}`, 'alto', i)), AHORA);
check('partiendo de 0,98 sigue sin pasar de 1', saturated.occupancy <= 1,
  `ocupación = ${saturated.occupancy}`);

console.log('\n🧪 Prioridad: lo medido gana a lo derivado');
const mixed = applySignals(salou, 0.85, [
  { ...occupancySignal(0.70, 1), method: 'derived', source_url: null, dedup_key: 'd' },
  occupancySignal(0.40, 1)
], AHORA);
check('se queda con la medida y no con la derivada', mixed.occupancy === 0.4,
  `ocupación = ${mixed.occupancy}`);

console.log('\n🧪 Contradicción: se conserva el error del modelo');
const contradiction = applySignals(salou, 0.95, [occupancySignal(0.30, 1)], AHORA);
const modelError = contradiction.provenance.base - contradiction.provenance.measured;
check('se puede medir cuánto se equivocaba el modelo',
  Math.abs(modelError - 0.65) < 0.001, `error = ${modelError}`);

console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed} correctas, ${failed} fallidas\n`);
process.exit(failed === 0 ? 0 : 1);
