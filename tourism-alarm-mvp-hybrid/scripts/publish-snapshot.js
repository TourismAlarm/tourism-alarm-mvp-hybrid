#!/usr/bin/env node
// 📤 Publica en el snapshot las señales que has aprobado.
//
// Es el único punto por el que un dato recogido por un agente llega al mapa
// público. Solo pasa lo que está en estado `approved`: si no lo has revisado,
// no sale.
//
//   node scripts/publish-snapshot.js            # hoy y mañana
//   node scripts/publish-snapshot.js --days=3
//   node scripts/publish-snapshot.js --dry-run  # enseña qué publicaría

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCollectorClient, isoDay, normalizeId, parseArgs } from './collect/lib.js';
import { validateSignal } from '../src/lib/signals.js';

const SNAPSHOT_PATH = 'public/data/current.json';

// Campos que viajan al snapshot. El resto (revisor, notas internas, ids) se
// queda en la base de datos: el mapa es público.
const PUBLISHED_FIELDS = [
  'source_id', 'municipality_id', 'scope', 'scope_key', 'metric',
  'valid_for', 'value', 'payload', 'method', 'source_url', 'observed_at'
];

export function slimSignal(signal) {
  const slim = {};
  for (const field of PUBLISHED_FIELDS) {
    if (signal[field] !== null && signal[field] !== undefined) slim[field] = signal[field];
  }
  if (slim.municipality_id) slim.municipality_id = normalizeId(slim.municipality_id);
  // dedup_key no se publica, pero validateSignal lo exige: se recompone.
  return slim;
}

/** Días que cubre el horizonte de la aplicación. */
export function horizonDays(count = 2, from = new Date()) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(from);
    date.setDate(date.getDate() + i);
    return isoDay(date);
  });
}

/**
 * Mezcla las señales aprobadas en el snapshot. Función pura: no toca red ni
 * disco, para poder probarla.
 */
export function mergeIntoSnapshot(snapshot, signals, { days, now = new Date() } = {}) {
  const known = new Set(snapshot.municipalities.map(m => normalizeId(m.id)));
  const byDay = {};
  const skipped = [];

  for (const signal of signals) {
    if (days && !days.includes(signal.valid_for)) {
      skipped.push({ signal, reason: 'fuera del horizonte' });
      continue;
    }
    if (signal.municipality_id && !known.has(normalizeId(signal.municipality_id))) {
      skipped.push({ signal, reason: `municipio desconocido: ${signal.municipality_id}` });
      continue;
    }

    (byDay[signal.valid_for] ||= []).push(slimSignal(signal));
  }

  return {
    snapshot: {
      ...snapshot,
      signals: {
        as_of: Object.keys(byDay).length ? now.toISOString() : null,
        days: byDay
      }
    },
    published: Object.values(byDay).reduce((sum, list) => sum + list.length, 0),
    skipped
  };
}

async function fetchApproved(supabase, days) {
  const { data, error } = await supabase
    .from('signals')
    .select('*')
    .eq('status', 'approved')
    .in('valid_for', days)
    .order('observed_at', { ascending: false });

  if (error) throw new Error(`no se pudieron leer las señales: ${error.message}`);
  return data ?? [];
}

async function main() {
  const args = parseArgs();
  const days = horizonDays(Number(args.days) || 2);
  const dryRun = Boolean(args['dry-run']);

  console.log(`\n📤 Publicando señales aprobadas para ${days.join(' y ')}\n`);

  const supabase = createCollectorClient();
  const approved = await fetchApproved(supabase, days);
  console.log(`   ${approved.length} señales aprobadas en la base de datos`);

  // Se revalidan antes de publicar: la última barrera antes del mapa público.
  for (const signal of approved) {
    try {
      validateSignal(signal);
    } catch (error) {
      throw new Error(`señal ${signal.id} no supera la validación: ${error.message}`);
    }
  }

  const snapshot = JSON.parse(await readFile(resolve(SNAPSHOT_PATH), 'utf-8'));
  const { snapshot: next, published, skipped } = mergeIntoSnapshot(snapshot, approved, { days });

  for (const { signal, reason } of skipped) {
    console.warn(`   ⚠️ descartada (${reason}): ${signal.source_id} · ${signal.metric}`);
  }

  if (dryRun) {
    console.log(`\n📋 Publicaría ${published} señales. No se ha escrito nada.\n`);
    for (const [day, list] of Object.entries(next.signals.days)) {
      console.log(`   ${day}: ${list.length}`);
      for (const s of list.slice(0, 5)) {
        console.log(`      ${s.municipality_id ?? 'CAT'} · ${s.metric} · ${s.value ?? '—'} · ${s.method}`);
      }
    }
    console.log();
    return;
  }

  await writeFile(resolve(SNAPSHOT_PATH), JSON.stringify(next), 'utf-8');
  console.log(`\n✅ ${published} señales publicadas en ${SNAPSHOT_PATH}`);
  console.log('   Ahora: npm run build && despliega (o git push si Vercel está conectado)\n');
}

// Solo se ejecuta como script; importado, expone las funciones para pruebas.
if (process.argv[1] && process.argv[1].endsWith('publish-snapshot.js')) {
  main().catch(error => {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  });
}
