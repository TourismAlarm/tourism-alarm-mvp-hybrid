#!/usr/bin/env node
// 🔁 Orquestador: lo que llama el cron de OpenClaw en cada pasada.
//
// Hace tres cosas:
//   1. mira si has pedido alguna ejecución manual desde la página de revisión,
//   2. ejecuta los recolectores activos,
//   3. cierra las peticiones manuales que haya atendido.
//
//   node scripts/collect/run-all.js               # los habilitados
//   node scripts/collect/run-all.js --only=agenda # uno concreto
//   node scripts/collect/run-all.js --dry-run     # sin escribir nada

import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCollectorClient, parseArgs, takePendingRequests, closeRequests } from './lib.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// Ficheros de este directorio que NO son recolectores.
const NOT_COLLECTORS = new Set(['lib.js', 'run-all.js', 'check.js', 'template.js']);

async function discoverCollectors() {
  const files = (await readdir(HERE)).filter(
    file => file.endsWith('.js') && !NOT_COLLECTORS.has(file)
  );

  const collectors = [];
  for (const file of files) {
    const module = await import(pathToFileURL(join(HERE, file)).href);
    if (typeof module.collect !== 'function' || !module.SOURCE_ID) {
      console.warn(`⚠️ ${file} no exporta SOURCE_ID y collect(): se omite`);
      continue;
    }
    collectors.push({ file, ...module });
  }
  return collectors;
}

async function main() {
  const args = parseArgs();
  const dryRun = Boolean(args['dry-run']);

  const collectors = await discoverCollectors();
  const selected = args.only
    ? collectors.filter(c => c.SOURCE_ID === args.only || c.file === args.only)
    : collectors;

  if (!selected.length) {
    console.log(collectors.length
      ? `No hay ningún recolector que coincida con "${args.only}".`
      : 'No hay recolectores todavía. Copia scripts/collect/template.js para crear uno.');
    return;
  }

  console.log(`🔁 ${selected.length} recolector(es): ${selected.map(c => c.SOURCE_ID).join(', ')}\n`);

  // Peticiones manuales dejadas desde la página de revisión.
  const supabase = dryRun ? null : createCollectorClient();
  const requests = new Map();
  if (supabase) {
    for (const collector of selected) {
      const pending = await takePendingRequests(supabase, collector.SOURCE_ID);
      if (pending.length) {
        requests.set(collector.SOURCE_ID, pending.map(r => r.id));
        console.log(`📨 ${pending.length} petición(es) manual(es) para ${collector.SOURCE_ID}`);
      }
    }
  }

  let failures = 0;
  for (const collector of selected) {
    const manual = requests.get(collector.SOURCE_ID) ?? [];
    const { runCollector } = await import('./lib.js');

    const result = await runCollector(
      { sourceId: collector.SOURCE_ID, trigger: manual.length ? 'manual' : 'scheduled', dryRun },
      collector.collect
    );

    if (!result.ok) failures++;

    if (supabase && manual.length) {
      await closeRequests(supabase, manual, {
        runId: result.runId ?? null,
        status: result.ok ? 'done' : 'failed'
      });
    }
    console.log('');
  }

  if (failures) {
    console.error(`❌ ${failures} recolector(es) fallaron`);
    process.exitCode = 1;
  } else {
    console.log('✅ Todos los recolectores han terminado bien');
  }
}

main().catch(error => {
  console.error(`❌ ${error.message}`);
  process.exit(1);
});
