// 🗄️ Archivo histórico append-only, compartido por los colectores.
//
//   data/signals/<lo que sea>/YYYY-MM.ndjson
//
// Una línea por observación. Solo se añade al final: en git son diffs de
// puras altas y nunca se toca lo ya escrito, así que el histórico no se puede
// corromper por accidente. Un fichero al mes mantiene el directorio manejable
// y cada línea se lee con un grep.
//
// Lo escribió primero el colector de meteorología; el nowcast necesitaba
// exactamente lo mismo, así que vive aquí en vez de estar dos veces.

import { readFile, appendFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';

export function archivePath(dir, when = new Date()) {
  const month = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
  return join(dir, `${month}.ndjson`);
}

/** Todo menos la marca de tiempo: dos ejecuciones seguidas suelen dar esto igual. */
export const fingerprint = ({ run, ...rest }) => JSON.stringify(rest);

/**
 * Última huella conocida de cada clave en el fichero del mes.
 *
 * Sirve para no repetir líneas idénticas: si el colector se lanza cada hora,
 * lo más probable es que no haya cambiado nada y no tiene sentido escribirlo
 * veinticuatro veces al día. Solo se anota lo que de verdad cambia.
 */
export async function lastFingerprints(path, key) {
  let text;
  try {
    text = await readFile(resolve(path), 'utf-8');
  } catch {
    return new Map(); // primer día del mes
  }

  const last = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      last.set(key(row), fingerprint(row));
    } catch {
      // Una línea corrupta no invalida el resto del histórico.
    }
  }
  return last;
}

export function changedRows(rows, known, key) {
  return rows.filter(row => known.get(key(row)) !== fingerprint(row));
}

/**
 * Añade al histórico del mes solo las filas que aportan algo nuevo.
 * @returns {{path: string, added: number, total: number}}
 */
export async function appendChanged(dir, rows, { key, when = new Date() }) {
  const path = archivePath(dir, when);
  const known = await lastFingerprints(path, key);
  const changed = changedRows(rows, known, key);

  if (changed.length) {
    await mkdir(dirname(resolve(path)), { recursive: true });
    await appendFile(resolve(path), changed.map(row => JSON.stringify(row)).join('\n') + '\n', 'utf-8');
  }

  return { path, added: changed.length, total: rows.length };
}
