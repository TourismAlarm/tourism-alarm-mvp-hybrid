// 📥 Carga de los datos del mapa con degradación controlada.
//
// El formato que espera el frontend es el que genera scripts/build-map-data.js:
//   { metadata, distribution, occupancy_by_brand, municipalities: [...] }
//
// Antes se validaba `data.points`, un formato de heatmap que ya no genera
// ningún script: eso hacía que TODA respuesta válida se descartase y la app
// cayese siempre al fichero de respaldo.

const REQUIRED_FIELDS = ['id', 'name', 'monthly_intensity'];

export class DataLoadError extends Error {
  constructor(message, attempts) {
    super(message);
    this.name = 'DataLoadError';
    this.attempts = attempts;
  }
}

function validate(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('la respuesta no es un objeto JSON');
  }

  if (!Array.isArray(data.municipalities) || data.municipalities.length === 0) {
    throw new Error('falta el array "municipalities"');
  }

  const sample = data.municipalities[0];
  const missing = REQUIRED_FIELDS.filter(field => sample[field] === undefined);
  if (missing.length) {
    throw new Error(`los municipios no tienen los campos: ${missing.join(', ')}`);
  }

  return data;
}

async function loadFrom(url, { bustCache }) {
  const target = bustCache ? `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}` : url;

  const response = await fetch(target, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return validate(await response.json());
}

/**
 * Intenta cargar los datos de las URLs indicadas, en orden.
 * Devuelve { data, source, degraded, attempts } para que la interfaz pueda
 * avisar de que está mostrando datos de respaldo en vez de fallar en silencio.
 */
export async function loadTourismData(urls, { bustCache = false } = {}) {
  const attempts = [];

  for (const url of urls) {
    try {
      const data = await loadFrom(url, { bustCache });
      return {
        data,
        source: url,
        degraded: attempts.length > 0,
        attempts
      };
    } catch (error) {
      attempts.push({ url, message: error.message });
      console.warn(`⚠️ No se pudo cargar ${url}: ${error.message}`);
    }
  }

  throw new DataLoadError(
    `No se pudieron cargar los datos del mapa (${attempts.length} intentos fallidos)`,
    attempts
  );
}
