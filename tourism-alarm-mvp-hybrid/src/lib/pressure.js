// 📊 Cálculo del índice de presión turística.
//
// Este módulo lo usan tanto el generador de datos (scripts/) como el navegador
// (src/), para que la cifra que se ve en el mapa se calcule siempre igual.
//
// La intensidad de un municipio en una fecha concreta sale de combinar:
//
//   capacidad real (IDESCAT)  ×  ocupación esperada de ese día
//
// La capacidad es un dato duro: plazas hoteleras, de camping y de turismo
// rural por municipio. La ocupación esperada se construye por capas, y cada
// capa está etiquetada según lo sólida que sea (ver DATA-SOURCES en el README).

// Pesos del índice: la densidad manda (es lo que sufre quien está allí), pero
// el volumen absoluto evita que Barcelona quede infravalorada por superficie.
export const WEIGHT_DENSITY = 0.62;
export const WEIGHT_VOLUME = 0.38;

// Anclas absolutas de las escalas logarítmicas: el índice significa lo mismo
// aunque el IDESCAT publique datos nuevos.
export const DENSITY_FLOOR = 1;      // 1 plaza/km²  -> 0
export const DENSITY_CEILING = 800;  // 800 plazas/km² -> 1 (Salou real: ~2.450)
export const VOLUME_FLOOR = 50;      // 50 plazas -> 0
export const VOLUME_CEILING = 25000; // 25.000 plazas -> 1 (Barcelona real: 82.470)

export const PEAK_OCCUPANCY = 0.85;
export const MIN_OCCUPANCY = 0.05;

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const round = (n, d = 3) => Number(n.toFixed(d));

export function logScore(value, floor, ceiling) {
  if (!(value > floor)) return 0;
  return clamp(Math.log10(value / floor) / Math.log10(ceiling / floor), 0, 1);
}

/**
 * Intensidad de un municipio para una ocupación dada (0-1).
 * `municipality` necesita `total_places` y `places_per_km2`.
 */
export function intensityFor(municipality, occupancy) {
  const places = municipality.total_places || 0;
  const density = municipality.places_per_km2 || 0;
  const rate = clamp(occupancy, 0, 1);

  return round(
    clamp(
      WEIGHT_DENSITY * logScore(density * rate, DENSITY_FLOOR, DENSITY_CEILING) +
        WEIGHT_VOLUME * logScore(places * rate, VOLUME_FLOOR, VOLUME_CEILING),
      0,
      1
    )
  );
}

export const LEVELS = [
  { key: 'critica',  label: 'Crítica',  min: 0.8, color: '#c0272d' },
  { key: 'alta',     label: 'Alta',     min: 0.6, color: '#f2874a' },
  { key: 'media',    label: 'Media',    min: 0.4, color: '#f7d060' },
  { key: 'moderada', label: 'Moderada', min: 0.2, color: '#b9dc9a' },
  { key: 'baja',     label: 'Baja',     min: 0,   color: '#e6f0e2' }
];

export function levelFor(intensity) {
  return LEVELS.find(level => intensity > level.min) || LEVELS[LEVELS.length - 1];
}

export function categorize(intensity) {
  return levelFor(intensity).key;
}

// ── Ocupación diaria ────────────────────────────────────────────────────────

const MONTH_MIDPOINTS = [15, 45, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349];

/**
 * Interpola la curva mensual de ocupación de una marca turística a un día
 * concreto del año. Los valores mensuales se anclan a mediados de mes y se
 * interpolan de forma continua, cerrando el círculo entre diciembre y enero,
 * para que no haya saltos bruscos el día 1.
 */
export function occupancyOnDay(monthlyOccupancy, dayOfYear) {
  if (!monthlyOccupancy) return PEAK_OCCUPANCY;

  const value = month => monthlyOccupancy[month] ?? monthlyOccupancy[String(month)] ?? PEAK_OCCUPANCY;

  // Mes cuyo punto medio queda justo antes del día pedido.
  let index = MONTH_MIDPOINTS.findIndex(mid => mid > dayOfYear) - 1;
  if (index < -1) index = 11; // después del 15 de diciembre
  if (index === -1) index = 11; // antes del 15 de enero

  const startDay = MONTH_MIDPOINTS[index];
  const endIndex = (index + 1) % 12;
  const endDay = MONTH_MIDPOINTS[endIndex];

  const span = endDay > startDay ? endDay - startDay : endDay + 365 - startDay;
  const elapsed = dayOfYear >= startDay ? dayOfYear - startDay : dayOfYear + 365 - startDay;
  const t = clamp(span === 0 ? 0 : elapsed / span, 0, 1);

  // Interpolación suave (coseno): evita los picos angulosos de la lineal.
  const smooth = (1 - Math.cos(t * Math.PI)) / 2;
  return value(index + 1) * (1 - smooth) + value(endIndex + 1) * smooth;
}

// ── Presión de excursionistas ───────────────────────────────────────────────
//
// El IDESCAT solo cuenta plazas de alojamiento, o sea turismo que PERNOCTA.
// Para "¿a qué playa voy hoy?" eso se queda corto: Montgat o Castelldefels no
// tienen apenas hoteles y un sábado de agosto están llenas de gente que va y
// vuelve desde Barcelona en el mismo día. Si solo miráramos plazas, saldrían
// como playas vacías, que es justo lo contrario de la realidad.
//
// Esta capa es un MODELO, no una medición: estima la presión de excursionistas
// a partir de la distancia a los grandes núcleos urbanos. Está separada del
// índice del IDESCAT para que se vea qué parte es dato y qué parte es
// estimación.

// Núcleos de origen de excursionistas y su peso relativo aproximado.
// Barcelona y su área metropolitana dominan con diferencia el turismo de día
// en la costa catalana.
export const URBAN_CORES = [
  { name: 'Barcelona', lat: 41.3851, lng: 2.1734, weight: 1.0 },
  { name: 'Tarragona-Reus', lat: 41.1358, lng: 1.1069, weight: 0.22 },
  { name: 'Girona', lat: 41.9794, lng: 2.8214, weight: 0.14 }
];

// A partir de esta distancia la excursión de un día deja de ser cómoda.
const DAYTRIP_DECAY_KM = 32;

export function distanceKm(aLat, aLng, bLat, bLng) {
  const toRad = deg => (deg * Math.PI) / 180;
  const meanLat = toRad((aLat + bLat) / 2);
  const dLat = (aLat - bLat) * 111.32;
  const dLng = (aLng - bLng) * 111.32 * Math.cos(meanLat);
  return Math.hypot(dLat, dLng);
}

/**
 * Accesibilidad de un punto para una excursión de día (0-1). Se suman los
 * núcleos porque una playa puede recibir gente de más de uno.
 */
export function daytripAccess(lat, lng) {
  if (lat === null || lng === null) return 0;

  const total = URBAN_CORES.reduce((sum, core) => {
    const km = distanceKm(lat, lng, core.lat, core.lng);
    return sum + core.weight * Math.exp(-km / DAYTRIP_DECAY_KM);
  }, 0);

  return clamp(total, 0, 1);
}

/**
 * Presión de excursionistas de una playa en un día concreto.
 *
 * Solo aplica a municipios costeros: es el "voy a la playa y vuelvo" que la
 * estadística de alojamiento no ve. Se apoya en la misma ocupación estacional
 * del IDESCAT (en enero nadie va a la playa) y en el tiempo del día.
 */
export function daytripPressure(municipality, seasonalOccupancy, dayFactor) {
  if (!municipality.coastal) return 0;

  const access = municipality.daytrip_access ?? daytripAccess(municipality.lat, municipality.lng);
  if (access <= 0) return 0;

  // La estacionalidad de la marca marca cuándo apetece bañarse; el factor del
  // día (calendario × meteorología) marca si HOY apetece.
  return round(clamp(access * clamp(seasonalOccupancy / PEAK_OCCUPANCY, 0, 1) * dayFactor, 0, 1));
}

/**
 * Afluencia total esperada: la mayor de las dos presiones.
 *
 * No se suman porque miden poblaciones distintas que ocupan el mismo sitio;
 * quedarse con la mayor evita inflar el resultado.
 */
export function combinedPressure(overnight, daytrip) {
  return round(Math.max(overnight, daytrip));
}
