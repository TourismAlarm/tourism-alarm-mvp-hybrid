// 📡 Señales: cómo un dato real sustituye a una estimación.
//
// El mapa parte de una BASE estimada (capacidad IDESCAT × estacionalidad ×
// calendario × meteorología). Cuando un agente trae una medición de verdad
// —ocupación publicada por un ayuntamiento, un evento con aforo— esa señal
// tiene que poder corregir la base sin que se pierda de vista qué parte es
// medición y qué parte sigue siendo modelo.
//
// Reglas:
//
//  1. Una ocupación MEDIDA sustituye a la ocupación estimada, no a la
//     intensidad final. Así la fórmula sigue aplicando densidad y volumen
//     igual para todos y las cifras siguen siendo comparables entre sí.
//  2. Una medición envejece. La de esta mañana manda; la de anteayer sobre hoy
//     ya no es una medición, es un pronóstico, y se mezcla con la base.
//  3. Los EVENTOS no sustituyen: suman. Un concierto se añade a la ocupación
//     que ya hubiera, con tope, porque no sabemos a cuánta gente desplaza.
//  4. Todo resultado dice de qué está hecho. Nunca se presenta una estimación
//     con el aspecto de una medición.

import { clamp, round, intensityFor } from './pressure.js';

export const METHODS = ['measured', 'derived', 'estimated'];
export const METRICS = ['occupancy', 'event', 'traffic', 'beach_occupancy'];

// Prioridad entre métodos: lo medido gana a lo derivado, y ambos a lo estimado.
const METHOD_RANK = { measured: 3, derived: 2, estimated: 1 };

// Una medición vale del todo mientras es reciente y se va difuminando hacia la
// base a medida que envejece. Nunca baja de MIN_TRUST: aunque sea de ayer,
// sigue diciendo algo.
const FULL_TRUST_HOURS = 6;
const NO_TRUST_HOURS = 48;
const MIN_TRUST = 0.3;

// Tope de lo que pueden sumar los eventos de un día.
const EVENT_UPLIFT_CAP = 0.35;
const EVENT_UPLIFT = { alto: 0.15, medio: 0.08, bajo: 0.03 };

export class SignalError extends Error {}

/**
 * Valida una señal antes de aceptarla. Refleja las mismas reglas que impone el
 * esquema de Supabase, para que un recolector falle pronto y con un mensaje
 * claro en vez de estrellarse contra la base de datos.
 */
export function validateSignal(signal) {
  if (!signal || typeof signal !== 'object') {
    throw new SignalError('la señal no es un objeto');
  }
  if (!METHODS.includes(signal.method)) {
    throw new SignalError(`method inválido: ${signal.method}`);
  }
  if (!METRICS.includes(signal.metric)) {
    throw new SignalError(`metric inválido: ${signal.metric}`);
  }
  if (signal.method !== 'derived' && !signal.source_url) {
    throw new SignalError('una señal no derivada necesita source_url: sin procedencia no hay señal');
  }
  if (!signal.observed_at) {
    throw new SignalError('falta observed_at');
  }
  if (!signal.valid_for) {
    throw new SignalError('falta valid_for');
  }
  if (signal.value !== null && signal.value !== undefined) {
    if (typeof signal.value !== 'number' || signal.value < 0 || signal.value > 1) {
      throw new SignalError(`value fuera de rango 0..1: ${signal.value}`);
    }
  }
  if (!signal.dedup_key) {
    throw new SignalError('falta dedup_key: el recolector debe poder reconocer lo ya insertado');
  }
  return signal;
}

/** Cuánto peso damos a una medición según su antigüedad. */
export function trustForAge(observedAt, now = Date.now()) {
  const ageHours = (now - new Date(observedAt).getTime()) / 3600000;

  if (Number.isNaN(ageHours)) return MIN_TRUST;
  if (ageHours <= FULL_TRUST_HOURS) return 1;
  if (ageHours >= NO_TRUST_HOURS) return MIN_TRUST;

  const decayed = 1 - (ageHours - FULL_TRUST_HOURS) / (NO_TRUST_HOURS - FULL_TRUST_HOURS);
  return round(clamp(MIN_TRUST + decayed * (1 - MIN_TRUST), MIN_TRUST, 1));
}

// De varias señales de ocupación para el mismo día, la mejor: primero por
// método, luego por lo reciente de la observación.
function bestOccupancy(signals) {
  return signals
    .filter(s => (s.metric === 'occupancy' || s.metric === 'beach_occupancy')
      && typeof s.value === 'number')
    .sort((a, b) => {
      const rank = (METHOD_RANK[b.method] || 0) - (METHOD_RANK[a.method] || 0);
      if (rank !== 0) return rank;
      return new Date(b.observed_at) - new Date(a.observed_at);
    })[0] || null;
}

function eventUplift(signals) {
  const events = signals.filter(s => s.metric === 'event');
  if (!events.length) return { uplift: 0, events: [] };

  const uplift = events.reduce((sum, event) => {
    const impact = event.payload?.impact;
    return sum + (EVENT_UPLIFT[impact] ?? EVENT_UPLIFT.bajo);
  }, 0);

  return { uplift: Math.min(uplift, EVENT_UPLIFT_CAP), events };
}

/**
 * Combina la ocupación estimada con las señales aprobadas de ese municipio y
 * día.
 *
 * @param municipality  municipio (necesita total_places y places_per_km2)
 * @param baseOccupancy ocupación estimada por el modelo (0-1)
 * @param signals       señales YA aprobadas y filtradas por municipio y día
 * @returns { occupancy, intensity, confidence, provenance }
 */
export function applySignals(municipality, baseOccupancy, signals = [], now = Date.now()) {
  const provenance = {
    base: round(baseOccupancy),
    measured: null,
    trust: null,
    events: [],
    uplift: 0,
    sources: []
  };

  let occupancy = baseOccupancy;
  let confidence = 'estimated';

  // 1. Ocupación medida: sustituye, con peso según antigüedad.
  const measurement = bestOccupancy(signals);
  if (measurement) {
    const trust = trustForAge(measurement.observed_at, now);
    occupancy = baseOccupancy * (1 - trust) + measurement.value * trust;

    provenance.measured = round(measurement.value);
    provenance.trust = trust;
    provenance.sources.push({
      source_id: measurement.source_id,
      url: measurement.source_url,
      method: measurement.method,
      observed_at: measurement.observed_at
    });

    // Solo se llama medición si viene de una medición reciente y de verdad.
    confidence = measurement.method === 'measured' && trust >= 0.7 ? 'measured' : 'partial';
  }

  // 2. Eventos: suman sobre lo que haya, con tope.
  const { uplift, events } = eventUplift(signals);
  if (uplift > 0) {
    occupancy = occupancy + uplift * (1 - occupancy); // se acerca a 1, nunca la pasa
    provenance.uplift = round(uplift);
    provenance.events = events.map(event => ({
      name: event.payload?.name || 'Evento',
      impact: event.payload?.impact || 'bajo',
      url: event.source_url
    }));
    for (const event of events) {
      provenance.sources.push({
        source_id: event.source_id,
        url: event.source_url,
        method: event.method,
        observed_at: event.observed_at
      });
    }
    if (confidence === 'estimated') confidence = 'partial';
  }

  occupancy = clamp(occupancy, 0, 1);

  return {
    occupancy: round(occupancy),
    intensity: intensityFor(municipality, occupancy),
    confidence,
    provenance
  };
}

export const CONFIDENCE_LABELS = {
  measured: { label: 'Medido', icon: '🟢', note: 'Dato observado de una fuente publicada' },
  partial: { label: 'Mixto', icon: '🟡', note: 'Estimación corregida con datos reales' },
  estimated: { label: 'Estimado', icon: '⚪', note: 'Solo modelo: IDESCAT, calendario y meteorología' }
};

/** Agrupa señales aprobadas por municipio para un día concreto. */
export function indexSignals(signals, day) {
  const index = new Map();
  for (const signal of signals) {
    if (day && signal.valid_for !== day) continue;
    if (!signal.municipality_id) continue;
    const key = String(signal.municipality_id).replace(/^0+/, '');
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(signal);
  }
  return index;
}
