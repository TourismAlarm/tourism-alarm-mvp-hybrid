// 📥 Lectores de los CSV oficiales del IDESCAT que hay en dataidescat-csv/
//
// Son dos formatos distintos:
//   1) t60XXmunYYYY00.csv  -> capacidad por municipio (Codi;Nom;...;Total)
//   2) idescat-turhot-*.csv -> pernoctaciones mensuales por marca turística
//      (formato largo: row;col;r;c;value;status;ref)

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeId } from './comarques.js';

const CSV_DIR = 'dataidescat-csv/Capacidad hotelera';

// El IDESCAT exporta con BOM, separador ";" y coma decimal.
function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function splitCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ';' && !inQuotes) {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map(f => f.trim());
}

function toNumber(raw) {
  if (raw === undefined || raw === null) return null;
  const cleaned = String(raw).trim().replace(/\./g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '..' || cleaned === ':') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee un CSV de capacidad por municipio y devuelve Map<idNormalizado, total>.
 * La cabecera está en la línea que empieza por "Codi;" y la última columna
 * siempre es "Total".
 */
export async function readCapacityCsv(filename) {
  const raw = stripBom(await readFile(join(CSV_DIR, filename), 'utf-8'));
  const lines = raw.split(/\r?\n/);

  const headerIndex = lines.findIndex(l => l.startsWith('Codi;'));
  if (headerIndex === -1) {
    throw new Error(`${filename}: no se encuentra la cabecera "Codi;"`);
  }

  const header = splitCsvLine(lines[headerIndex]);
  const totalIndex = header.lastIndexOf('Total');
  if (totalIndex === -1) {
    throw new Error(`${filename}: no se encuentra la columna "Total"`);
  }

  const values = new Map();
  const names = new Map();

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);
    const code = cols[0];
    // Las filas de totales agregados ("Catalunya") no llevan código numérico.
    if (!/^\d+$/.test(code)) continue;

    const id = normalizeId(code);
    values.set(id, toNumber(cols[totalIndex]) ?? 0);
    names.set(id, cols[1]);
  }

  return { values, names, source: filename };
}

const CATALAN_MONTHS = {
  gener: 1, febrer: 2, 'març': 3, abril: 4, maig: 5, juny: 6,
  juliol: 7, agost: 8, setembre: 9, octubre: 10, novembre: 11, desembre: 12
};

// ref = "Agost del 2024 (p)" -> { month: 8, year: 2024 }
function parsePeriod(ref) {
  const match = String(ref).match(/^([^ ]+)\s+del\s+(\d{4})/i);
  if (!match) return null;
  const month = CATALAN_MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  return { month, year: Number(match[2]) };
}

/**
 * Lee todos los CSV mensuales de pernoctaciones hoteleras (turhot) y agrega,
 * por marca turística, la media de pernoctaciones de cada mes del año.
 *
 * Devuelve Map<marca, { [month]: mediaPernoctaciones }>.
 */
export async function readMonthlyStaysByBrand() {
  const files = (await readdir(CSV_DIR))
    .filter(f => /^idescat-turhot-.*\.csv$/i.test(f));

  // marca -> mes -> lista de valores (uno por año disponible)
  const samples = new Map();
  const periods = new Set();

  for (const file of files) {
    const raw = stripBom(await readFile(join(CSV_DIR, file), 'utf-8'));
    const lines = raw.split(/\r?\n/);
    if (!lines.length) continue;

    const header = splitCsvLine(lines[0]);
    if (header[0] !== 'row') continue; // ficheros de error de la API

    const iRow = header.indexOf('row');
    const iCol = header.indexOf('col');
    const iValue = header.indexOf('value');
    const iRef = header.indexOf('ref');

    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const cols = splitCsvLine(line);
      if (cols[iCol] !== 'Valor') continue;

      const brand = cols[iRow];
      if (!brand || brand === 'Total pernoctacions') continue;

      const value = toNumber(cols[iValue]);
      const period = parsePeriod(cols[iRef]);
      if (value === null || !period) continue;

      const key = `${brand}|${period.year}-${period.month}`;
      if (periods.has(key)) continue; // hay ficheros duplicados descargados
      periods.add(key);

      if (!samples.has(brand)) samples.set(brand, new Map());
      const byMonth = samples.get(brand);
      if (!byMonth.has(period.month)) byMonth.set(period.month, []);
      byMonth.get(period.month).push(value);
    }
  }

  const result = new Map();
  for (const [brand, byMonth] of samples) {
    const monthly = {};
    for (const [month, values] of byMonth) {
      monthly[month] = values.reduce((a, b) => a + b, 0) / values.length;
    }
    result.set(brand, monthly);
  }

  return { stays: result, filesRead: files.length, periodsRead: periods.size };
}
