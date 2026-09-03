// 🧰 Marco para los recolectores que corren en el PC de casa.
//
// Un recolector es un script normal de Node, NO un turno del LLM. El modelo no
// produce cifras: como mucho normaliza texto que ya existe. Esa separación es
// lo que hace que la cola de revisión signifique algo.
//
// Cada recolector:
//   1. abre una ejecución en `agent_runs` (para "ver a los agentes trabajar"),
//   2. pide datos a su fuente,
//   3. los convierte en señales con procedencia,
//   4. las inserta como `pending` para que las revises,
//   5. cierra la ejecución con el resultado.
//
// Si algo falla, la ejecución queda registrada con el error en vez de
// desaparecer en silencio.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { validateSignal } from '../../src/lib/signals.js';

const URL_VAR = 'SUPABASE_URL';
const KEY_VAR = 'SUPABASE_SERVICE_KEY';

/**
 * Cliente con permisos de escritura.
 *
 * Usa la service_role key porque las políticas RLS solo dejan pasar a usuarios
 * autenticados y un script no lo es. Esa clave SALTA RLS: vive en el .env
 * local, nunca en el repositorio y nunca en el navegador.
 */
export function createCollectorClient() {
  const url = process.env[URL_VAR];
  const key = process.env[KEY_VAR];

  if (!url || !key) {
    throw new Error(
      `Faltan credenciales. Copia .env.example a .env y rellena ${URL_VAR} y ${KEY_VAR}.\n` +
      '  La service_role key está en Supabase → Project Settings → API Keys.\n' +
      '  No la subas al repositorio ni la uses en el navegador.'
    );
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

/** Fecha en formato YYYY-MM-DD, en hora local. */
export function isoDay(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Códigos IDESCAT: el TopoJSON los guarda sin cero inicial. */
export function normalizeId(id) {
  return String(id).trim().replace(/^0+/, '');
}

/**
 * Ejecuta un recolector con registro de ejecución y manejo de errores.
 *
 * @param options.sourceId   id en la tabla `sources`
 * @param options.trigger    'scheduled' | 'manual'
 * @param options.dryRun     si true, no escribe nada: enseña lo que haría
 * @param collect            async ({ supabase, log }) => señales[]
 */
export async function runCollector({ sourceId, trigger = 'scheduled', dryRun = false }, collect) {
  const started = Date.now();
  const lines = [];
  const log = (...parts) => {
    const line = parts.join(' ');
    lines.push(line);
    console.log(line);
  };

  log(`▶ ${sourceId}${dryRun ? ' (simulación, no escribe nada)' : ''}`);

  if (dryRun) {
    try {
      const signals = await collect({ supabase: null, log });
      log(`\n📋 ${signals.length} señales que se insertarían:`);
      for (const signal of signals) {
        validateSignal(signal);
        log(`   ${signal.municipality_id ?? signal.scope_key ?? 'CAT'} · ${signal.metric}` +
            ` · ${signal.valid_for} · ${signal.value ?? '—'} · ${signal.method}` +
            `\n      ${signal.source_url ?? '(derivada)'}`);
      }
      log('\n✅ Simulación correcta: todas las señales son válidas.');
      return { ok: true, signals };
    } catch (error) {
      log(`\n❌ ${error.message}`);
      process.exitCode = 1;
      return { ok: false, error };
    }
  }

  const supabase = createCollectorClient();

  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .insert({ source_id: sourceId, trigger, status: 'running' })
    .select('id')
    .single();

  if (runError) {
    console.error(`❌ No se pudo abrir la ejecución: ${runError.message}`);
    process.exitCode = 1;
    return { ok: false, error: runError };
  }

  try {
    const signals = await collect({ supabase, log });

    for (const signal of signals) validateSignal(signal);
    log(`📋 ${signals.length} señales validadas`);

    let inserted = 0;
    if (signals.length) {
      // upsert sobre (source_id, dedup_key): volver a ejecutar el recolector
      // actualiza lo que ya había en vez de duplicarlo.
      const { data, error } = await supabase
        .from('signals')
        .upsert(
          signals.map(s => ({ ...s, source_id: sourceId })),
          { onConflict: 'source_id,dedup_key', ignoreDuplicates: false }
        )
        .select('id');

      if (error) throw new Error(`inserción rechazada: ${error.message}`);
      inserted = data?.length ?? 0;
    }

    await supabase.from('agent_runs').update({
      status: 'ok',
      finished_at: new Date().toISOString(),
      signals_created: inserted,
      log: lines.join('\n')
    }).eq('id', run.id);

    log(`✅ ${inserted} señales en cola de revisión · ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return { ok: true, runId: run.id, inserted };
  } catch (error) {
    await supabase.from('agent_runs').update({
      status: 'error',
      finished_at: new Date().toISOString(),
      error: error.message,
      log: lines.join('\n')
    }).eq('id', run.id);

    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
    return { ok: false, error };
  }
}

/**
 * Atiende las peticiones de ejecución manual dejadas desde la página privada.
 * El cron lo llama en cada pasada; si no hay nada pendiente, no hace nada.
 */
export async function takePendingRequests(supabase, sourceId) {
  const { data, error } = await supabase
    .from('run_requests')
    .update({ status: 'taken', taken_at: new Date().toISOString() })
    .eq('status', 'pending')
    .eq('source_id', sourceId)
    .select('id');

  if (error) {
    console.warn(`⚠️ No se pudieron leer las peticiones manuales: ${error.message}`);
    return [];
  }
  return data ?? [];
}

export async function closeRequests(supabase, requestIds, { runId, status }) {
  if (!requestIds.length) return;
  await supabase
    .from('run_requests')
    .update({ status, finished_at: new Date().toISOString(), run_id: runId })
    .in('id', requestIds);
}

/** Lee argumentos tipo --clave=valor y banderas --clave. */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)(?:=(.*))?$/);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}
