// 📅 Calendario: festivos de Catalunya y efecto del día de la semana.
//
// El día de la semana y los festivos no salen de ninguna fuente estadística
// del repositorio: son un MODELO, no una medición. Están aquí explícitos y
// con valores modestos para poder revisarlos cuando haya datos diarios reales.

export const WEEKDAY_NAMES = [
  'domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'
];

// Pesos brutos por día de la semana (0 = domingo). Se normalizan más abajo
// para que la media semanal sea exactamente 1 y el modelo no infle ni desinfle
// la ocupación anual que sí viene del IDESCAT.
const RAW_WEEKDAY_WEIGHTS = [1.12, 0.94, 0.93, 0.94, 0.97, 1.06, 1.20];
const WEEKDAY_MEAN = RAW_WEEKDAY_WEIGHTS.reduce((a, b) => a + b, 0) / 7;
export const WEEKDAY_WEIGHTS = RAW_WEEKDAY_WEIGHTS.map(w => w / WEEKDAY_MEAN);

// Un festivo se comporta como un domingo; la víspera, como un viernes.
const HOLIDAY_WEIGHT = WEEKDAY_WEIGHTS[0];
const HOLIDAY_EVE_WEIGHT = WEEKDAY_WEIGHTS[5];

/**
 * Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano).
 * Se calcula en vez de escribirlo a mano para que el calendario no caduque.
 */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const FIXED_HOLIDAYS = [
  ['01-01', "Cap d'Any"],
  ['01-06', 'Reis'],
  ['05-01', 'Festa del Treball'],
  ['06-24', 'Sant Joan'],
  ['08-15', "l'Assumpció"],
  ['09-11', 'Diada de Catalunya'],
  ['10-12', "Festa Nacional d'Espanya"],
  ['11-01', 'Tots Sants'],
  ['12-06', 'Dia de la Constitució'],
  ['12-08', 'La Immaculada'],
  ['12-25', 'Nadal'],
  ['12-26', 'Sant Esteve']
];

const pad = n => String(n).padStart(2, '0');
export const isoDate = date =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const isoUtc = date =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const holidayCache = new Map();

/**
 * Festivos oficiales de Catalunya de un año. No incluye las dos fiestas
 * locales que fija cada ayuntamiento.
 */
export function holidaysOf(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);

  const holidays = new Map();
  for (const [suffix, name] of FIXED_HOLIDAYS) {
    holidays.set(`${year}-${suffix}`, name);
  }

  const easter = easterSunday(year);
  const shift = days => {
    const date = new Date(easter);
    date.setUTCDate(date.getUTCDate() + days);
    return isoUtc(date);
  };
  holidays.set(shift(-2), 'Divendres Sant');
  holidays.set(shift(1), 'Dilluns de Pasqua');

  holidayCache.set(year, holidays);
  return holidays;
}

export function holidayName(date) {
  return holidaysOf(date.getFullYear()).get(isoDate(date)) || null;
}

export function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

/**
 * Factor de calendario de una fecha: combina día de la semana, festivo y
 * víspera de festivo. Devuelve también el motivo, para poder explicarlo en la
 * interfaz en vez de mostrar un número sin contexto.
 */
export function calendarFactor(date) {
  const holiday = holidayName(date);

  const tomorrow = new Date(date);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextHoliday = holidayName(tomorrow);

  const weekday = date.getDay();
  const weights = [WEEKDAY_WEIGHTS[weekday]];
  const reasons = [];

  if (holiday) {
    weights.push(HOLIDAY_WEIGHT);
    reasons.push(holiday);
  } else if (nextHoliday) {
    weights.push(HOLIDAY_EVE_WEIGHT);
    reasons.push(`víspera de ${nextHoliday}`);
  }

  if (weekday === 6 || weekday === 0) reasons.push('fin de semana');

  // Se toma el mayor de los pesos aplicables, no el producto: un sábado que
  // además es festivo no se llena el doble.
  return {
    factor: Math.max(...weights),
    weekday,
    weekdayName: WEEKDAY_NAMES[weekday],
    holiday,
    reasons
  };
}
