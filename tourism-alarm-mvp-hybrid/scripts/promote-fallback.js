#!/usr/bin/env node
// 📌 Promueve current.json a last-good.json.
//
// Solo debe ejecutarse DESPUÉS de que la verificación pase: así el fichero de
// respaldo es siempre la última versión que se sabe buena, y una regeneración
// defectuosa no se lleva por delante la copia de seguridad.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CURRENT = 'public/data/current.json';
const FALLBACK = 'public/data/last-good.json';

const data = JSON.parse(await readFile(resolve(CURRENT), 'utf-8'));

data.metadata = {
  ...data.metadata,
  promoted_at: new Date().toISOString(),
  note: 'Copia de respaldo de current.json, promovida tras pasar la verificación'
};

await writeFile(resolve(FALLBACK), JSON.stringify(data), 'utf-8');
console.log(`📌 ${FALLBACK} actualizado (${data.municipalities.length} municipios)`);
