// 📋 PLANTILLA de recolector. Cópiala con otro nombre en este directorio y
// run-all.js la encontrará sola.
//
// Reglas del proyecto, que no son negociables:
//
//   · El recolector NO inventa cifras. Si la fuente no lo dice, no se pone.
//   · Toda señal lleva `source_url`: el enlace donde cualquiera puede
//     comprobar el dato. La base de datos rechaza las que no lo llevan.
//   · `method` describe qué es de verdad:
//       'measured'  — lo publica la fuente tal cual
//       'derived'   — calculado a partir de otras señales
//       'estimated' — modelo. Úsalo poco y dilo claro.
//   · `dedup_key` tiene que ser estable: si el recolector vuelve a correr, la
//     misma observación debe actualizarse, no duplicarse.
//   · `value` va de 0 a 1. Si la fuente da porcentajes, divide entre 100.
//
// Si necesitas que un LLM participe, que sea SOLO para normalizar texto que ya
// tienes ("Festa Major, 12-15 agost" → fechas estructuradas). Nunca para
// producir un número que la fuente no diga.

import { isoDay, normalizeId } from './lib.js';

export const SOURCE_ID = 'plantilla'; // debe existir en la tabla `sources`

/**
 * @param {object} ctx
 * @param {import('@supabase/supabase-js').SupabaseClient} ctx.supabase
 * @param {(...parts: string[]) => void} ctx.log
 * @returns {Promise<object[]>} señales
 */
export async function collect({ log }) {
  const today = isoDay();

  // 1. Pedir los datos a la fuente.
  //    const response = await fetch('https://...');
  //    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  //    const data = await response.json();

  log('ejemplo: la plantilla no consulta ninguna fuente real');

  // 2. Convertir cada observación en una señal.
  const signals = [];

  // signals.push({
  //   municipality_id: normalizeId('439057'),   // código IDESCAT
  //   scope: 'municipality',
  //   metric: 'occupancy',                       // occupancy | event | traffic | beach_occupancy
  //   valid_for: today,                          // el día al que se refiere
  //   value: 0.62,                               // 0..1, null para eventos
  //   payload: null,                             // detalle libre (nombre del evento…)
  //   method: 'measured',
  //   source_url: 'https://.../pagina-concreta', // comprobable
  //   observed_at: new Date().toISOString(),     // cuándo lo dijo la fuente
  //   dedup_key: `439057-${today}`               // estable entre ejecuciones
  // });

  return signals;
}
