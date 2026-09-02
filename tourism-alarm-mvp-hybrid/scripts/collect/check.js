#!/usr/bin/env node
// 🔌 Comprobación de conexión con Supabase.
//
// Es lo primero que hay que ejecutar en la máquina donde vivan los agentes:
// confirma que las credenciales funcionan, que las tablas están y que se puede
// escribir. No inventa ni inserta ninguna señal.
//
//   node scripts/collect/check.js

import { createCollectorClient } from './lib.js';

const checks = [];
const record = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n🔌 Comprobando la conexión con Supabase\n');

let supabase;
try {
  supabase = createCollectorClient();
  record('credenciales presentes', true, process.env.SUPABASE_URL);
} catch (error) {
  console.log(`  ❌ ${error.message}\n`);
  process.exit(1);
}

for (const table of ['sources', 'signals', 'agent_runs', 'run_requests']) {
  const { error, count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  record(`tabla ${table}`, !error, error ? error.message : `${count ?? 0} filas`);
}

// Escritura real: se abre una ejecución de prueba y se borra acto seguido.
const { data: run, error: writeError } = await supabase
  .from('agent_runs')
  .insert({ source_id: 'idescat', trigger: 'manual', status: 'ok',
            finished_at: new Date().toISOString(), log: 'comprobación de conexión' })
  .select('id')
  .single();

record('permiso de escritura', !writeError, writeError?.message ?? 'ok');

if (run) {
  const { error: deleteError } = await supabase.from('agent_runs').delete().eq('id', run.id);
  record('permiso de borrado', !deleteError, deleteError?.message ?? 'prueba limpiada');
}

// La restricción de procedencia tiene que rechazar una cifra sin fuente.
const { error: guardError } = await supabase.from('signals').insert({
  source_id: 'idescat', municipality_id: '439057', metric: 'occupancy',
  valid_for: new Date().toISOString().slice(0, 10), value: 0.5,
  method: 'measured', source_url: null,
  observed_at: new Date().toISOString(), dedup_key: 'comprobacion-sin-fuente'
});
record('rechaza cifras sin procedencia', Boolean(guardError),
  guardError ? 'la base de datos la bloqueó' : 'LA ACEPTÓ — revisa el esquema');

const failed = checks.filter(c => !c.ok).length;
console.log(`\n${failed === 0 ? '✅ Todo listo para recolectar.' : `❌ ${failed} comprobaciones fallidas.`}\n`);
process.exit(failed === 0 ? 0 : 1);
