// 📚 Lector del histórico de ocupación 2006-2025 (IDESCAT).
//
// Es la serie más larga que tiene el proyecto: 236 meses, de enero de 2006 a
// agosto de 2025, con el grado de ocupación de las doce zonas turísticas. De
// aquí sale la "curva esperada": qué es normal en cada zona y cada mes.
//
// Formato largo del IDESCAT, igual que los CSV de turhot:
//   row;col;r;c;value;status
//   "Costa Daurada";"08/2024";6;13;90,2;
//
// `status` marca por qué falta un dato:
//   z   no procede — la zona no existía ese mes
//   ..  no disponible
//   b   ruptura de serie (el valor SÍ está y es bueno)

// Coma decimal y punto de millares. Tiene que exigir al menos un dígito: con
// `[\d.]+` el propio marcador de "no disponible" del IDESCAT, `..`, pasaba el
// filtro, se le quitaban los puntos y acababa valiendo 0.
const DECIMAL = /^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$|^-?\d+(?:,\d+)?$/;

/** El IDESCAT usa coma decimal y punto de millares. */
export function toNumber(raw) {
  const text = String(raw ?? '').trim();
  if (!text || !DECIMAL.test(text)) return null;
  const value = Number(text.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ';' && !quoted) {
      out.push(field);
      field = '';
    } else field += ch;
  }
  out.push(field);
  return out.map(f => f.trim());
}

// "08/2024" o "08/2025 (p)" → { year, month }
function parsePeriod(text) {
  const match = /^(\d{2})\/(\d{4})/.exec(String(text).trim());
  if (!match) return null;
  const month = Number(match[1]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[2]), month };
}

// El total de Catalunya viaja en la misma tabla, con este nombre. No es una
// zona: se separa para no contaminar la lista.
export const TOTAL_ROW = 'Total viatgers';

/**
 * Por qué un CERO EXACTO se descarta.
 *
 * Las tres zonas que el IDESCAT dejó de publicar —Costa de Garraf, Costa
 * Barcelona-Maresme y Catalunya Central— reaparecen en 2024-2025 con valor 0 y
 * el estado VACÍO, como si fuera una medición. No lo es:
 *
 *   · son tres territorios distintos marcando exactamente 0 el mismo mes,
 *     cosa que no ocurre ni en un confinamiento;
 *   · los mismos meses aparecen unas veces como `z` (no procede) y otras
 *     como 0, según el mes: es el mismo hecho marcado de dos maneras;
 *   · esas zonas se absorbieron en 2012 y 2015; cuando existían de verdad
 *     marcaban entre el 40% y el 89%.
 *
 * Es un relleno para una zona que ya no se mide. Tomarlo al pie de la letra
 * hundiría su curva esperada: Costa de Garraf saldría al 0% en abril, mayo y
 * julio. En las doce zonas no hay ni un solo cero que sea una medición de
 * verdad —el único creíble de toda la tabla, el confinamiento de abril de
 * 2020, está en la fila del total de Catalunya, que no es una zona—, así que
 * la regla es simple y sin excepciones: cero exacto, dato ausente.
 */
export const isPlaceholderZero = value => value === 0;

/**
 * Lee el CSV y devuelve Map<zona, Map<"YYYY-MM", valor 0..1>>.
 * Los valores llegan en porcentaje y salen en tanto por uno.
 */
export function readHistoricalCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const header = splitCsvLine(lines[0] || '');

  const iRow = header.indexOf('row');
  const iCol = header.indexOf('col');
  const iValue = header.indexOf('value');
  const iStatus = header.indexOf('status');

  if (iRow < 0 || iCol < 0 || iValue < 0) {
    throw new Error('el CSV histórico no tiene las columnas row, col y value');
  }

  const series = new Map();
  const dropped = { placeholderZero: 0, missingStatus: 0, unparsable: 0 };

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = splitCsvLine(line);

    const period = parsePeriod(cols[iCol]);
    if (!period) continue;

    const zone = cols[iRow];
    const status = iStatus >= 0 ? cols[iStatus] : '';

    if (status === 'z' || status === '..') { dropped.missingStatus++; continue; }

    const value = toNumber(cols[iValue]);
    if (value === null) { dropped.unparsable++; continue; }
    if (isPlaceholderZero(value)) { dropped.placeholderZero++; continue; }

    if (!series.has(zone)) series.set(zone, new Map());
    series.get(zone).set(
      `${period.year}-${String(period.month).padStart(2, '0')}`,
      Math.min(1, value / 100)
    );
  }

  return { series, dropped };
}

// ── estadística ─────────────────────────────────────────────────────────────

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}

const monthOf = key => Number(key.slice(5, 7));
const yearOf = key => Number(key.slice(0, 4));

/**
 * Resumen por mes del año de una zona.
 *
 * Se usa la MEDIANA, no la media. Con veinte años la serie arrastra 2020 y
 * 2021, y el COVID hunde la media casi cinco puntos en Barcelona (80,4 frente
 * a 85,3). La mediana ni se entera: dos años anómalos de veinte no mueven el
 * valor central. Así no hace falta decidir a mano qué años se excluyen.
 */
export function monthlyStats(zoneSeries) {
  const byMonth = new Map();
  for (const [key, value] of zoneSeries) {
    const month = monthOf(key);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(value);
  }

  const stats = {};
  for (const [month, values] of byMonth) {
    stats[month] = {
      median: round(median(values)),
      p25: round(percentile(values, 0.25)),
      p75: round(percentile(values, 0.75)),
      min: round(Math.min(...values)),
      max: round(Math.max(...values)),
      n: values.length
    };
  }
  return stats;
}

const round = value => (value === null ? null : Number(value.toFixed(4)));

/**
 * Cuánto se ha movido el nivel de una zona respecto a su propia historia.
 *
 * Hay tendencia: en agosto, Barcelona pasa de una media de 79,3 en sus cinco
 * primeros años a 86,0 en los cinco últimos, y la Costa Brava de 80,4 a 85,6.
 * Son cinco o siete puntos. Una mediana de veinte años se queda corta para
 * decir qué es normal HOY.
 *
 * La corrección se hace en dos piezas, cada una con los datos que le convienen:
 * la FORMA estacional sale de los veinte años, donde hay muchas muestras por
 * mes; el NIVEL sale de los años recientes, que es lo que se parece a hoy. El
 * factor es un único número por zona, fácil de auditar, y se calcula sobre
 * todos los meses a la vez para no amplificar el ruido de un mes concreto.
 *
 * Los años COVID se excluyen aquí: al mirar solo los últimos años ya no son
 * dos de veinte, y la mediana dejaría de protegernos.
 */
export const COVID_YEARS = new Set([2020, 2021]);

export function levelFactor(zoneSeries, { recentYears = 5, excludeYears = COVID_YEARS } = {}) {
  const usable = [...zoneSeries].filter(([key]) => !excludeYears.has(yearOf(key)));
  if (!usable.length) return { factor: 1, recent: null, historic: null, years: [] };

  const years = [...new Set(usable.map(([key]) => yearOf(key)))].sort((a, b) => b - a);
  const recent = new Set(years.slice(0, recentYears));

  // Se compara mes contra mes: si los años recientes solo traen enero a
  // agosto, medirlos contra un histórico que incluye diciembre compararía
  // temporada alta con temporada baja y daría un factor inventado.
  const months = new Set([...usable].filter(([k]) => recent.has(yearOf(k))).map(([k]) => monthOf(k)));
  const inMonths = ([key]) => months.has(monthOf(key));

  const recentValues = usable.filter(([k]) => recent.has(yearOf(k))).map(([, v]) => v);
  const historicValues = usable.filter(inMonths).map(([, v]) => v);

  const recentMedian = median(recentValues);
  const historicMedian = median(historicValues);

  const factor = recentMedian && historicMedian ? recentMedian / historicMedian : 1;

  return {
    factor: Number(factor.toFixed(4)),
    recent: round(recentMedian),
    historic: round(historicMedian),
    years: [...recent].sort()
  };
}

/**
 * Curva esperada de una zona: doce meses en tanto por uno.
 *
 * Se toma la mediana de los años RECIENTES, mes a mes, y solo se cae a los
 * veinte años cuando no hay muestras recientes suficientes.
 *
 * El primer intento fue otro: mediana de veinte años multiplicada por un
 * factor de nivel único por zona. Estaba mal, y se vio enseguida en la
 * Costa Daurada. Su mediana de agosto es 88%, su nivel reciente +12%, y el
 * producto daba 99%: una ocupación que no existe. El crecimiento de esa zona
 * no está en agosto —que lleva veinte años rozando su techo— sino en abril,
 * mayo y octubre. Un factor multiplicativo único reparte por igual una
 * subida que no fue igual, y arriba se sale de la escala, porque la
 * ocupación tiene un tope y la multiplicación no lo sabe.
 *
 * Usar directamente la mediana reciente de cada mes evita el problema de
 * raíz: no hay que modelar ninguna tendencia, porque el dato reciente YA es
 * el nivel de hoy, y cada mes lleva el suyo.
 */
export function expectedMonths(zoneSeries, {
  recentYears = 8,
  minSamples = 4,
  excludeYears = COVID_YEARS
} = {}) {
  const usable = [...zoneSeries].filter(([key]) => !excludeYears.has(yearOf(key)));
  const years = [...new Set(usable.map(([key]) => yearOf(key)))];

  // Ventana por años de CALENDARIO, no "los N años que tengan dato". Costa de
  // Garraf solo publica 2006-2011 y 2024-2025: coger sus ocho años con dato
  // metía 2006 en lo "reciente". Así, si una zona lleva una década sin
  // medirse, no tiene datos recientes y se cae al histórico largo, que es lo
  // honesto.
  const newest = Math.max(...years);
  const recent = new Set(years.filter(year => year > newest - recentYears));

  const byMonth = new Map();
  for (const [key, value] of usable) {
    const month = monthOf(key);
    if (!byMonth.has(month)) byMonth.set(month, { recent: [], all: [] });
    const bucket = byMonth.get(month);
    bucket.all.push(value);
    if (recent.has(yearOf(key))) bucket.recent.push(value);
  }

  const curve = {};
  const origin = {};
  const samples = {};

  for (const [month, { recent: recentValues, all }] of byMonth) {
    const useRecent = recentValues.length >= minSamples;
    const values = useRecent ? recentValues : all;
    if (!values.length) continue;

    curve[month] = round(median(values));
    origin[month] = useRecent ? 'reciente' : 'histórico';
    samples[month] = values.length;
  }

  return { curve, origin, samples, recent_years: [...recent].sort() };
}

export const coveredMonths = curve => Object.keys(curve).length;
