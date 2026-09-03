#!/usr/bin/env node
// 🔎 Sondeo de fuentes oficiales — ronda 2.
//
// La ronda 1 (data/official/probe/) confirmó: INE Tempus3 responde (ocupación
// por puntos turísticos: tablas 75198 hoteles, 75193 apartamentos, 75196
// campings), IDESCAT sirve CSV de población y plazas por municipio, y las
// tablas de móviles del INE se niegan por volumen. Esta ronda busca:
//   · ocupación mensual por ZONAS turísticas (INE), para las marcas;
//   · una vía de acceso a los turistas por municipio (móviles) con filtros.
//
// Corre en GitHub Actions y en el build de Vercel; desde el entorno de
// desarrollo estas webs están bloqueadas.

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = process.env.PROBE_OUT || (process.env.VERCEL ? 'public/data/official-probe' : 'data/official/probe2');
const DEFAULT_CAP = 400 * 1024;
const TIMEOUT_MS = 25000;
const UA = 'TourismAlarm/1.0 (+https://github.com/TourismAlarm/tourism-alarm-mvp-hybrid; sondeo de fuentes oficiales)';
const INE = 'https://servicios.ine.es/wstempus/js/ES';

const summary = [];

async function fetchCapped(url, { cap = DEFAULT_CAP } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'application/json, text/csv, text/plain, */*' } });
    const chunks = [];
    let received = 0;
    let truncated = false;
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > cap) { chunks.push(value.subarray(0, value.length - (received - cap))); truncated = true; await reader.cancel(); break; }
        chunks.push(value);
      }
    }
    return { status: response.status, type: response.headers.get('content-type') || '', body: Buffer.concat(chunks).toString('utf-8'), bytes: received, truncated };
  } finally {
    clearTimeout(timer);
  }
}

const slug = name => name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };

async function probe(name, url, options = {}) {
  const started = Date.now();
  const entry = { name, url };
  try {
    const result = await fetchCapped(url, options);
    Object.assign(entry, { status: result.status, type: result.type, bytes: result.bytes, truncated: result.truncated, ms: Date.now() - started, head: result.body.slice(0, 600).replace(/\s+/g, ' ') });
    const ext = /json/.test(result.type) ? 'json' : /csv/.test(result.type) ? 'csv' : /html/.test(result.type) ? 'html' : 'txt';
    entry.file = `${slug(name)}.${ext}`;
    await writeFile(resolve(OUT_DIR, entry.file), result.body, 'utf-8');
    console.log(`${String(result.status).padStart(3)}  ${name.padEnd(36)} ${result.type.split(';')[0].padEnd(24)} ${String(result.bytes).padStart(9)} B${result.truncated ? ' (cortado)' : ''}  ${entry.ms} ms`);
    console.log(`     ${entry.head.slice(0, 380)}`);
    return result;
  } catch (error) {
    entry.error = error.message;
    console.log(`ERR  ${name.padEnd(36)} ${error.message}`);
    return null;
  } finally {
    summary.push(entry);
  }
}

async function main() {
  await mkdir(resolve(OUT_DIR), { recursive: true });
  console.log(`Sondeo de fuentes oficiales, ronda 2 — ${new Date().toISOString()}\n`);

  // ── INE: ocupación por zonas turísticas (hoteles 238, apartamentos 239,
  //    campings 240, turismo rural 241) ──
  console.log('── INE: tablas por zonas turísticas ──');
  for (const op of [238, 239, 240, 241]) {
    const result = await probe(`ine-tablas-${op}`, `${INE}/TABLAS_OPERACION/${op}`, { cap: 2 * 1024 * 1024 });
    const tables = result ? parseJson(result.body) : null;
    if (!Array.isArray(tables)) continue;
    const zones = tables.filter(t => /zonas? tur/i.test(t.Nombre));
    console.log(`   op ${op}: ${zones.length} tablas por zonas turísticas`);
    for (const t of zones) console.log(`      ${t.Id}  ${t.Nombre}`);
    for (const t of zones.filter(t => /ocupaci/i.test(t.Nombre)).slice(0, 2)) {
      await probe(`ine-zonas-${t.Id}`, `${INE}/DATOS_TABLA/${t.Id}?nult=1&tip=AM`, { cap: 3 * 1024 * 1024 });
    }
  }

  // ── INE: turistas por municipio de destino (móviles). Las tablas enteras
  //    se niegan por volumen; se prueba a filtrar por municipio y el volcado
  //    CSV. ──
  console.log('\n── INE: móviles por municipio (53464 interno, 52048 receptor) ──');
  for (const table of [53464, 52048]) {
    const vars = await probe(`ine-variables-${table}`, `${INE}/VARIABLES_TABLA/${table}`);
    const variables = vars ? parseJson(vars.body) : null;
    if (!Array.isArray(variables)) continue;
    console.log(`   variables: ${variables.map(v => `${v.Id}:${v.Nombre}`).join(' | ')}`);
    const muni = variables.find(v => /municipio/i.test(v.Nombre));
    if (!muni) continue;

    const values = await probe(`ine-valores-${table}-${muni.Id}`, `${INE}/VALORES_VARIABLETABLA/${muni.Id}/${table}`, { cap: 6 * 1024 * 1024 });
    const list = values ? parseJson(values.body) : null;
    if (!Array.isArray(list)) continue;
    const catalan = list.filter(v => /^(08|17|25|43)\d{3}$/.test(String(v.Codigo)));
    console.log(`   municipios en la tabla: ${list.length}; de Catalunya: ${catalan.length}; ejemplo: ${JSON.stringify(list[0])}`);
    const salou = list.find(v => /^salou$/i.test(v.Nombre)) || catalan[0];
    if (salou) {
      await probe(`ine-datos-${table}-salou`, `${INE}/DATOS_TABLA/${table}?tv=${muni.Id}:${salou.Id}&nult=3&tip=AM`, { cap: 2 * 1024 * 1024 });
    }
  }
  await probe('ine-csv-53464', 'https://servicios.ine.es/wstempus/csv_bdsc/ES/DATOS_TABLA/53464?nult=1', { cap: 2 * 1024 * 1024 });

  // ── AMB: la ocupación seguía "SENSE_INFORMACIO" el 2 de septiembre; se
  //    vuelve a mirar por si es cuestión de hora. ──
  console.log('\n── AMB ──');
  const amb = await probe('amb-estat-platja', 'https://opendata.amb.cat/dades_estat_platja/search');
  const items = amb ? parseJson(amb.body)?.items : null;
  if (Array.isArray(items)) {
    const counts = items.reduce((acc, it) => { acc[it.ocupacio] = (acc[it.ocupacio] || 0) + 1; return acc; }, {});
    console.log(`   ocupacio: ${JSON.stringify(counts)}`);
  }

  await writeFile(resolve(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\n${summary.length} sondeos. Resumen en ${OUT_DIR}/summary.json`);
}

main().catch(error => { console.error('❌ Sondeo fallido:', error); process.exit(1); });
