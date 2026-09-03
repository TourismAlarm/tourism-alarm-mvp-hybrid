#!/usr/bin/env node
// 🔎 Sondeo de fuentes oficiales.
//
// Pregunta a cada fuente candidata qué devuelve de verdad (código, tipo,
// tamaño, primeras líneas) y guarda el cuerpo en data/official/probe/ para
// poder escribir los lectores contra respuestas reales y no contra lo que
// dice una documentación.
//
// Corre en GitHub Actions: desde el entorno de desarrollo estas webs están
// bloqueadas por el proxy de salida.

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const OUT_DIR = 'data/official/probe';
const DEFAULT_CAP = 400 * 1024;
const TIMEOUT_MS = 45000;

const UA = 'TourismAlarm/1.0 (+https://github.com/TourismAlarm/tourism-alarm-mvp-hybrid; sondeo de fuentes oficiales)';

const summary = [];

/** Descarga con tope de bytes: algunas tablas del INE pesan decenas de MB. */
async function fetchCapped(url, { cap = DEFAULT_CAP, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'application/json, text/csv, text/plain, */*', ...headers }
    });

    const chunks = [];
    let received = 0;
    let truncated = false;
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > cap) {
          chunks.push(value.subarray(0, value.length - (received - cap)));
          truncated = true;
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }

    return {
      status: response.status,
      type: response.headers.get('content-type') || '',
      finalUrl: response.url,
      body: Buffer.concat(chunks).toString('utf-8'),
      bytes: received,
      truncated
    };
  } finally {
    clearTimeout(timer);
  }
}

function slug(name) {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

async function probe(name, url, options = {}) {
  const started = Date.now();
  const entry = { name, url };
  try {
    const result = await fetchCapped(url, options);
    Object.assign(entry, {
      status: result.status,
      type: result.type,
      bytes: result.bytes,
      truncated: result.truncated,
      ms: Date.now() - started,
      head: result.body.slice(0, 300).replace(/\s+/g, ' ')
    });
    const ext = /json/.test(result.type) ? 'json' : /csv/.test(result.type) ? 'csv' : /html/.test(result.type) ? 'html' : 'txt';
    const file = `${slug(name)}.${ext}`;
    await writeFile(resolve(OUT_DIR, file), result.body, 'utf-8');
    entry.file = file;
    console.log(`${String(result.status).padStart(3)}  ${name.padEnd(34)} ${result.type.split(';')[0].padEnd(24)} ${String(result.bytes).padStart(9)} B${result.truncated ? ' (cortado)' : ''}  ${entry.ms} ms`);
    console.log(`     ${entry.head.slice(0, 160)}`);
    return result;
  } catch (error) {
    entry.error = error.message;
    console.log(`ERR  ${name.padEnd(34)} ${error.message}`);
    return null;
  } finally {
    summary.push(entry);
  }
}

const parseJson = text => { try { return JSON.parse(text); } catch { return null; } };

async function main() {
  await mkdir(resolve(OUT_DIR), { recursive: true });
  console.log(`Sondeo de fuentes oficiales — ${new Date().toISOString()}\n`);

  // ───────────────────────────────────────────────────────────── INE ────
  console.log('── INE (servicios.ine.es, API Tempus3) ──');
  const ops = await probe('ine-operaciones', 'https://servicios.ine.es/wstempus/js/ES/OPERACIONES_DISPONIBLES');
  const operations = ops ? parseJson(ops.body) : null;

  if (Array.isArray(operations)) {
    const interesting = operations.filter(op =>
      /ocupaci.n hotelera/i.test(op.Nombre) ||
      /tel.fon|m.vil|TMOV/i.test(op.Nombre) ||
      /apartamentos tur|campings|turismo rural/i.test(op.Nombre)
    );
    console.log(`   operaciones de interés: ${interesting.map(o => `${o.Id}:${o.Nombre}`).join(' | ')}`);

    for (const op of interesting) {
      const tablesResult = await probe(`ine-tablas-${op.Id}`, `https://servicios.ine.es/wstempus/js/ES/TABLAS_OPERACION/${op.Id}`, { cap: 2 * 1024 * 1024 });
      const tables = tablesResult ? parseJson(tablesResult.body) : null;
      if (!Array.isArray(tables)) continue;

      const wanted = tables.filter(t => /puntos tur/i.test(t.Nombre) || /municipio de destino/i.test(t.Nombre));
      console.log(`   ${op.Nombre}: ${tables.length} tablas, ${wanted.length} por puntos turísticos / municipio:`);
      for (const t of wanted) console.log(`      ${t.Id}  ${t.Nombre}  [${t.Periodicidad?.Nombre || t.FK_Periodicidad || '?'}]`);

      // Ocupación por plazas en puntos turísticos: la tabla que de verdad
      // interesa. Se baja con los dos últimos periodos para ver la estructura.
      for (const t of wanted.filter(t => /ocupaci.n/i.test(t.Nombre) && /plazas/i.test(t.Nombre))) {
        await probe(`ine-datos-${t.Id}`, `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${t.Id}?nult=2&tip=AM`, { cap: 3 * 1024 * 1024 });
      }
      // Turistas por municipio de destino (móviles): solo estructura.
      for (const t of wanted.filter(t => /municipio de destino/i.test(t.Nombre)).slice(0, 2)) {
        await probe(`ine-datos-${t.Id}`, `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/${t.Id}?nult=1&tip=AM`, { cap: 1536 * 1024 });
      }
    }
  }

  // ─────────────────────────────────────────────────────────── IDESCAT ──
  console.log('\n── IDESCAT ──');
  await probe('idescat-taules-v2', 'https://api.idescat.cat/taules/v2?lang=ca');
  await probe('idescat-taules-turhot', 'https://api.idescat.cat/taules/v2/turhot?lang=ca');
  await probe('idescat-taules-turall', 'https://api.idescat.cat/taules/v2/turall?lang=ca');
  await probe('idescat-taules-pmh', 'https://api.idescat.cat/taules/v2/pmh?lang=ca');
  await probe('idescat-emex-salou', 'https://api.idescat.cat/emex/v1/dades.json?id=431713&lang=ca');
  await probe('idescat-emex-nodes', 'https://api.idescat.cat/emex/v1/nodes.json?lang=ca', { cap: 200 * 1024 });

  // Indicadors de conjuntura (turhot): 10292 es pernoctacions per marques. Los
  // vecinos deberían ser viatgers y grau d'ocupació.
  for (const n of [10289, 10290, 10291, 10292, 10293, 10294]) {
    await probe(`idescat-conj-${n}`, `https://www.idescat.cat/indicadors/?id=conj&n=${n}&f=csv&lang=ca`, { cap: 64 * 1024 });
  }
  await probe('idescat-indicadors-api', 'https://api.idescat.cat/indicadors/v1/dades.json?i=10292&lang=ca');

  // Capacidad por municipio, ediciones más recientes que las del repositorio.
  for (const [n, year] of [[6031, 2024], [6031, 2025], [6036, 2025], [6039, 2025]]) {
    await probe(`idescat-turall-${n}-${year}`, `https://www.idescat.cat/pub/?id=turall&n=${n}&geo=mun&t=${year}00&f=csv&lang=ca`);
  }

  // Población: padró municipal, todos los municipios.
  await probe('idescat-pmh-pub-csv', 'https://www.idescat.cat/pub/?id=pmh&n=446&by=mun&f=csv&lang=ca');
  await probe('idescat-pmh-taula-mun', 'https://api.idescat.cat/taules/v2/pmh/446/mun?lang=ca');

  // ─────────────────────────────────────── playas en tiempo real ─────────
  console.log('\n── Playas (tiempo real) ──');
  await probe('amb-help', 'https://opendata.amb.cat/help.html');
  await probe('amb-estat-platja', 'https://opendata.amb.cat/dades_estat_platja/search');
  await probe('amb-estat-platja-json', 'https://opendata.amb.cat/dades_estat_platja/search?format=json', { headers: { Accept: 'application/json' } });
  await probe('amb-platges', 'https://opendata.amb.cat/platges/search');
  await probe('salou-platges', 'https://platges.salou.cat/');
  await probe('bcn-opendata-platges', 'https://opendata-ajuntament.barcelona.cat/data/api/3/action/package_search?q=platges&rows=20');

  // ────────────────────────────────────────────────────── meteorología ───
  console.log('\n── Open-Meteo ──');
  await probe('open-meteo', 'https://api.open-meteo.com/v1/forecast?latitude=41.0763&longitude=1.1417&daily=weather_code,temperature_2m_max&forecast_days=2&timezone=Europe%2FMadrid');

  await writeFile(resolve(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\n${summary.length} sondeos. Resumen en ${OUT_DIR}/summary.json`);
}

main().catch(error => {
  console.error('❌ Sondeo fallido:', error);
  process.exit(1);
});
