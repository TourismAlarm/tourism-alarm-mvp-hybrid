// 📈 Lectores de la API Tempus3 del INE (servicios.ine.es/wstempus).
//
// El INE publica lo que al IDESCAT le falta: el GRADO DE OCUPACIÓN mensual,
// medido, no deducido. Dos niveles:
//
//   · por ZONA turística  — las 9 marcas de Catalunya, todas cubiertas.
//   · por PUNTO turístico — unos 30 municipios, los que más importan
//     (Salou, Lloret, Barcelona, Sitges, Cambrils, Roses, Blanes…).
//
// Antes la ocupación se deducía de las pernoctaciones del IDESCAT
// normalizadas contra su mes punta y multiplicadas por 0,85. Era un proxy
// razonable, pero un proxy: 0,85 era una suposición y la forma de la curva
// dependía de que las pernoctaciones se movieran igual que la ocupación.
// Ahora la cifra es la que publica la encuesta.
//
// Formato de una serie Tempus3:
//   {
//     COD, Nombre, T3_Unidad, T3_Escala,
//     MetaData: [{ T3_Variable, Nombre, Codigo }, …],
//     Data: [{ Fecha, T3_TipoDato, T3_Periodo: 'M07', Anyo, Valor }, …]
//   }

// ── utilidades ──────────────────────────────────────────────────────────────

const strip = text =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Artículos que el INE pospone tras coma. El apóstrofo se trata aparte.
const POSTPOSED_ARTICLE = /,\s*(el|la|els|les|los|las|l'|s'|es|sa|ses)\s*$/;

/**
 * Nombre de municipio comparable entre fuentes.
 *
 * El INE escribe el artículo detrás ("Hospitalet de Llobregat, L'", "Vall de
 * Boí, La") y el TopoJSON delante ("l'Hospitalet de Llobregat", "la Vall de
 * Boí"). El artículo se MUEVE al principio, no se quita: quitarlo hacía que
 * "Granada" (la de Andalucía, punto turístico del INE) casara con "la
 * Granada" del Alt Penedès y le colgara su ocupación hotelera.
 */
export function normalizeName(name) {
  const clean = strip(name).trim();
  const article = POSTPOSED_ARTICLE.exec(clean);

  const moved = article
    ? `${article[1]} ${clean.slice(0, article.index)}`
    : clean;

  return moved.replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Los CSV del IDESCAT traen el código con cero inicial; el TopoJSON sin él. */
export const normalizeId = id => String(id).trim().replace(/^0+/, '');

/**
 * Código INE de 5 dígitos a partir del código IDESCAT de 6.
 * El de 6 es el del INE más un dígito de control: 439057 → 43905 (Salou).
 */
export function ineCodeOf(idescatId) {
  return String(idescatId).trim().padStart(6, '0').slice(0, 5);
}

const meta = (serie, variable) =>
  serie.MetaData?.find(m => new RegExp(variable, 'i').test(m.T3_Variable));

const periodMonth = point => {
  const match = /^M(\d{2})$/.exec(point.T3_Periodo || '');
  return match ? Number(match[1]) : null;
};

// ── marcas turísticas ───────────────────────────────────────────────────────

// El INE llama "zonas turísticas" a lo que el IDESCAT llama "marques". Son
// las mismas, con dos salvedades:
//   · "Costa Barcelona" arrastra definiciones viejas (2015, 2016, y las
//     antiguas Garraf y Maresme). La vigente es la de 2026; las demás ya no
//     se actualizan y hay que descartarlas o el mes saldría vacío.
//   · "Cataluña Central" es el nombre anterior de "Paisatges Barcelona": en
//     unas tablas aparece uno y en otras el otro.
const ZONE_TO_BRAND = new Map([
  ['cataluna barcelona', 'Barcelona'],
  ['cataluna costa brava', 'Costa Brava'],
  ['cataluna costa daurada', 'Costa Daurada'],
  ['cataluna costa barcelona 2026', 'Costa Barcelona'],
  ['cataluna terres de l ebre', "Terres de l'Ebre"],
  ['cataluna terres de lleida', 'Terres de Lleida'],
  ['cataluna vall d aran', "Val d'Aran"],
  ['cataluna paisatges barcelona', 'Paisatges Barcelona'],
  ['cataluna cataluna central', 'Paisatges Barcelona'],
  ['pirineus', 'Pirineus']
]);

export function brandOfZone(zoneName) {
  return ZONE_TO_BRAND.get(normalizeName(zoneName).replace(/[^a-z0-9 ]/g, '')) || null;
}

// ── conceptos ───────────────────────────────────────────────────────────────

// "Grado de ocupación por plazas" en hoteles, apartamentos y turismo rural;
// en campings la unidad de venta es la parcela y el INE publica "Grado de
// ocupación por parcelas". Se excluyen las variantes de fin de semana y por
// habitaciones: la afluencia del municipio la marca la plaza ocupada.
const OCCUPANCY_CONCEPTS = [
  /^grado de ocupacion por plazas$/,
  /^grado de ocupacion por parcelas$/
];

const isOccupancy = serie => {
  const concept = meta(serie, 'Concepto');
  const name = normalizeName(concept?.Nombre);
  return OCCUPANCY_CONCEPTS.some(re => re.test(name));
};

/**
 * Media por mes del año de una lista de observaciones mensuales.
 * Devuelve { 1: 0.42, …, 12: 0.31 } en tanto por uno, y solo los meses que
 * tienen al menos una observación: un mes sin dato es un mes sin dato, no un
 * cero.
 */
function monthlyAverage(points) {
  const buckets = new Map();

  for (const point of points) {
    const month = periodMonth(point);
    const value = typeof point.Valor === 'number' ? point.Valor : null;
    if (month === null || value === null) continue;
    if (!buckets.has(month)) buckets.set(month, []);
    buckets.get(month).push(value);
  }

  const curve = {};
  for (const [month, values] of buckets) {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    curve[month] = Number((mean / 100).toFixed(4)); // el INE da porcentaje
  }
  return curve;
}

/** Cuántos meses distintos del año cubre una curva. */
export const monthsCovered = curve => Object.keys(curve || {}).length;

/**
 * Curva mensual de ocupación por marca turística, a partir de una tabla del
 * INE "por zonas turísticas".
 *
 * @returns {Map<string, {curve: object, samples: number, zone: string}>}
 */
export function occupancyByBrand(series) {
  const result = new Map();

  for (const serie of series) {
    if (!isOccupancy(serie)) continue;

    const zone = meta(serie, 'ZONA')?.Nombre;
    const brand = brandOfZone(zone);
    if (!brand) continue;

    const points = (serie.Data || []).filter(p => typeof p.Valor === 'number');
    if (!points.length) continue;

    const curve = monthlyAverage(points);
    if (!monthsCovered(curve)) continue;

    // Una marca puede tener más de una serie candidata (definiciones viejas
    // de Costa Barcelona, o el par Cataluña Central / Paisatges Barcelona).
    // Gana la que trae más observaciones: es la que sigue viva.
    const previous = result.get(brand);
    if (!previous || points.length > previous.samples) {
      result.set(brand, { curve, samples: points.length, zone });
    }
  }

  return result;
}

/**
 * Resuelve un "punto turístico" del INE al código IDESCAT del municipio.
 *
 * El código del punto unas veces es el del INE ("08056") y otras uno interno
 * y opaco ("Q1" para Salou). Por eso hay tres vías, en orden de fiabilidad:
 *   1. el código, si es numérico de 5 dígitos;
 *   2. el código que a veces viene incrustado en el nombre de la serie
 *      ("… 43905-Salou.");
 *   3. el nombre del punto, normalizado.
 */
export function resolvePoint(serie, { byIneCode, byName }) {
  const point = meta(serie, 'PUNTOS');
  if (!point) return null;

  const code = String(point.Codigo || '').trim();
  if (/^\d{5}$/.test(code) && byIneCode.has(code)) return byIneCode.get(code);

  const embedded = /(\d{5})-/.exec(serie.Nombre || '');
  if (embedded && byIneCode.has(embedded[1])) return byIneCode.get(embedded[1]);

  return byName.get(normalizeName(point.Nombre)) || null;
}

/**
 * Curva mensual de ocupación por municipio, a partir de una tabla del INE
 * "por puntos turísticos".
 *
 * @param series      series de la tabla
 * @param index       { byIneCode, byName } → id IDESCAT
 * @returns {Map<string, {curve: object, samples: number, point: string}>}
 */
export function occupancyByMunicipality(series, index) {
  const result = new Map();

  for (const serie of series) {
    if (!isOccupancy(serie)) continue;

    const id = resolvePoint(serie, index);
    if (!id) continue;

    const points = (serie.Data || []).filter(p => typeof p.Valor === 'number');
    if (!points.length) continue;

    const curve = monthlyAverage(points);
    if (!monthsCovered(curve)) continue;

    const previous = result.get(id);
    if (!previous || points.length > previous.samples) {
      result.set(id, { curve, samples: points.length, point: meta(serie, 'PUNTOS')?.Nombre });
    }
  }

  return result;
}

/**
 * Índice para resolver puntos turísticos contra la lista de municipios del
 * mapa.
 */
export function buildMunicipalityIndex(municipalities) {
  const byIneCode = new Map();
  const byName = new Map();

  for (const municipality of municipalities) {
    byIneCode.set(ineCodeOf(municipality.id), normalizeId(municipality.id));
    // Con nombres repetidos entre provincias gana el primero; los puntos
    // turísticos del INE son destinos conocidos y no hay ambigüedad real.
    const key = normalizeName(municipality.name);
    if (!byName.has(key)) byName.set(key, normalizeId(municipality.id));
  }

  return { byIneCode, byName };
}

/**
 * Mezcla las curvas de los distintos tipos de alojamiento según la capacidad
 * real del municipio. Un municipio de campings debe seguir la ocupación de
 * los campings, no la de los hoteles.
 *
 * @param curves  { hotel, camping, rural } — cada una { mes: ocupación }
 * @param places  { hotel, camping, rural } — plazas del IDESCAT
 */
export function blendByCapacity(curves, places) {
  const weights = [
    ['hotel', places.hotel || 0],
    ['camping', places.camping || 0],
    ['rural', places.rural || 0]
  ].filter(([type, count]) => count > 0 && monthsCovered(curves[type]));

  if (!weights.length) {
    // Sin capacidad conocida o sin curva de su tipo: la de hoteles es la que
    // más cobertura tiene.
    return curves.hotel || curves.camping || curves.rural || {};
  }

  const blended = {};
  for (let month = 1; month <= 12; month++) {
    let sum = 0;
    let total = 0;
    for (const [type, count] of weights) {
      const value = curves[type][month];
      if (value === undefined) continue;
      sum += value * count;
      total += count;
    }
    if (total > 0) blended[month] = Number((sum / total).toFixed(4));
  }
  return blended;
}

// ── población (IDESCAT, padró municipal) ────────────────────────────────────

/**
 * Lee el CSV del padró municipal del IDESCAT: `Codi,Nom,Homes,Dones,Total`.
 * Devuelve Map<idNormalizado, habitantes>.
 */
export function readPopulationCsv(text) {
  const population = new Map();

  for (const line of text.split(/\r?\n/)) {
    const cols = line.split(',');
    if (cols.length < 5 || !/^\d{6}$/.test(cols[0].trim())) continue;
    const total = Number(cols[cols.length - 1].replace(/[.\s]/g, ''));
    if (!Number.isFinite(total)) continue;
    population.set(normalizeId(cols[0]), total);
  }

  return population;
}
