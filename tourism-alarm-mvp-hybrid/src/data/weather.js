// 🌤️ Previsión meteorológica de hoy y mañana (Open-Meteo).
//
// Open-Meteo es gratuita, no necesita clave y admite CORS, así que la llamada
// se hace desde el navegador. Es la ÚNICA fuente en vivo de la aplicación: si
// falla, el mapa sigue funcionando con la estimación estructural y de
// calendario, solo que sin ajuste meteorológico.

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const DAILY_FIELDS = [
  'weather_code',
  'temperature_2m_max',
  'precipitation_sum',
  'precipitation_probability_max',
  'wind_speed_10m_max',
  'sunshine_duration'
].join(',');

const BATCH_SIZE = 40;
const TIMEOUT_MS = 12000;

// Códigos WMO agrupados: solo se necesita saber si el día invita a la playa.
const WEATHER_CODES = new Map([
  [0, ['Despejado', '☀️']],
  [1, ['Casi despejado', '🌤️']],
  [2, ['Parcialmente nublado', '⛅']],
  [3, ['Nublado', '☁️']],
  [45, ['Niebla', '🌫️']], [48, ['Niebla', '🌫️']],
  [51, ['Llovizna', '🌦️']], [53, ['Llovizna', '🌦️']], [55, ['Llovizna', '🌦️']],
  [61, ['Lluvia débil', '🌧️']], [63, ['Lluvia', '🌧️']], [65, ['Lluvia fuerte', '🌧️']],
  [71, ['Nieve', '🌨️']], [73, ['Nieve', '🌨️']], [75, ['Nieve', '🌨️']],
  [80, ['Chubascos', '🌦️']], [81, ['Chubascos', '🌦️']], [82, ['Chubascos fuertes', '⛈️']],
  [95, ['Tormenta', '⛈️']], [96, ['Tormenta', '⛈️']], [99, ['Tormenta', '⛈️']]
]);

export function describeWeather(code) {
  const [label, icon] = WEATHER_CODES.get(code) || ['—', '🌡️'];
  return { label, icon };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function fetchBatch(points, days) {
  const params = new URLSearchParams({
    latitude: points.map(p => p.lat).join(','),
    longitude: points.map(p => p.lng).join(','),
    daily: DAILY_FIELDS,
    forecast_days: String(days),
    timezone: 'Europe/Madrid'
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${ENDPOINT}?${params}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    // Con una sola coordenada la API devuelve un objeto; con varias, un array.
    return Array.isArray(payload) ? payload : [payload];
  } finally {
    clearTimeout(timer);
  }
}

function readDay(location, index) {
  const daily = location?.daily;
  if (!daily || !Array.isArray(daily.time) || daily.time[index] === undefined) return null;

  const number = field => {
    const value = daily[field]?.[index];
    return typeof value === 'number' ? value : null;
  };

  return {
    date: daily.time[index],
    code: number('weather_code'),
    tempMax: number('temperature_2m_max'),
    rain: number('precipitation_sum'),
    rainChance: number('precipitation_probability_max'),
    wind: number('wind_speed_10m_max'),
    sunshineHours: (() => {
      const seconds = number('sunshine_duration');
      return seconds === null ? null : seconds / 3600;
    })()
  };
}

/**
 * Descarga la previsión de `days` días para una lista de puntos.
 * Devuelve un array paralelo a `points`; cada elemento es un array de días
 * (o null si ese punto no se pudo resolver).
 */
export async function fetchForecast(points, { days = 2 } = {}) {
  if (!points.length) return [];

  const batches = chunk(points, BATCH_SIZE);
  const results = await Promise.all(
    batches.map(async batch => {
      try {
        const locations = await fetchBatch(batch, days);
        return batch.map((_, i) => {
          const location = locations[i];
          const forecast = [];
          for (let day = 0; day < days; day++) {
            forecast.push(readDay(location, day));
          }
          return forecast.every(d => d === null) ? null : forecast;
        });
      } catch (error) {
        console.warn(`⚠️ Meteorología no disponible para un lote: ${error.message}`);
        return batch.map(() => null);
      }
    })
  );

  return results.flat();
}

// ── Derivadas ───────────────────────────────────────────────────────────────

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Cuánto modula el tiempo la AFLUENCIA. Un día de sol y 28° llena las playas;
 * uno de lluvia y viento las vacía. Es un modelo, no una medición.
 */
export function crowdFactor(day) {
  if (!day) return 1;

  let factor = 1;

  if (day.tempMax !== null) {
    if (day.tempMax < 16) factor *= 0.7;
    else if (day.tempMax < 20) factor *= 0.85;
    else if (day.tempMax < 24) factor *= 0.97;
    else if (day.tempMax < 28) factor *= 1.08;
    else if (day.tempMax < 33) factor *= 1.12;
    else factor *= 1.05;
  }

  if (day.rain !== null) {
    if (day.rain > 8) factor *= 0.65;
    else if (day.rain > 3) factor *= 0.8;
    else if (day.rain > 0.5) factor *= 0.92;
  }

  if (day.wind !== null) {
    if (day.wind > 40) factor *= 0.85;
    else if (day.wind > 25) factor *= 0.94;
  }

  return clamp(factor, 0.5, 1.25);
}

/**
 * Cómo de buen día de playa es (0-1), independientemente de la gente que haya.
 */
export function beachScore(day) {
  if (!day) return null;

  // Temperatura: óptimo alrededor de 28°, penalizando frío y calor extremo.
  const temp = day.tempMax === null
    ? 0.5
    : clamp(1 - Math.abs(day.tempMax - 28) / 14, 0, 1);

  const sun = day.sunshineHours === null
    ? 0.6
    : clamp(day.sunshineHours / 10, 0, 1);

  const dry = day.rain === null ? 0.8 : clamp(1 - day.rain / 6, 0, 1);
  const calm = day.wind === null ? 0.8 : clamp(1 - Math.max(0, day.wind - 12) / 33, 0, 1);

  return Number((0.38 * temp + 0.24 * sun + 0.23 * dry + 0.15 * calm).toFixed(3));
}
