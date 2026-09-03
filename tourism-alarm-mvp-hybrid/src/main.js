// 🚨 Tourism Alarm Catalunya — presión turística de hoy y mañana

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

import { loadTourismData, DataLoadError } from './data/fetchData.js';
import { fetchForecast, crowdFactor, beachScore, describeWeather } from './data/weather.js';
import { createMunicipalityLayer } from './map/municipalityLayer.js';
import {
  LEVELS, levelFor, occupancyOnDay, clamp, daytripPressure, combinedPressure
} from './lib/pressure.js';
import { calendarFactor, dayOfYear } from './lib/calendar.js';
import { applySignals, indexSignals, CONFIDENCE_LABELS } from './lib/signals.js';

const DATA_URLS = ['/data/current.json', '/data/last-good.json'];
const HORIZON_DAYS = 2; // hoy y mañana

const CATALUNYA_VIEW = {
  center: [41.75, 1.6],
  zoom: 8,
  minZoom: 7,
  maxZoom: 13,
  maxBoundsViscosity: 0.85,
  zoomControl: false,
  // Sin esto fitBounds redondea el zoom hacia abajo y Catalunya queda pequeña.
  zoomSnap: 0.25,
  zoomDelta: 0.5
};

const integer = new Intl.NumberFormat('es-ES');
const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
const el = id => document.getElementById(id);

// Los niveles claros de la paleta no contrastan sobre el panel blanco.
const TEXT_COLOR = {
  critica: '#b91c1c',
  alta: '#c2410c',
  media: '#a16207',
  moderada: '#3f6212',
  baja: '#475569'
};

// ───────────────────────────────────────────────────────────── estado ────

const state = {
  map: null,
  choropleth: null,
  data: null,
  bounds: null,
  day: 0,             // 0 = hoy, 1 = mañana
  weather: null,      // array paralelo a data.weather_points
  intensities: new Map(),
  breakdown: new Map(),
  confidence: new Map()
};

function dateForDay(offset) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

const pad = n => String(n).padStart(2, '0');
const isoDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// ────────────────────────────────────────────────────────────── cálculo ──

function weatherFor(municipality, day) {
  const index = municipality.weather_point;
  if (state.weather === null || index === undefined) return null;
  return state.weather[index]?.[day] ?? null;
}

/**
 * Presión turística de un municipio en el día seleccionado.
 *
 * capacidad real × ocupación estacional × calendario × meteorología
 */
function computeIntensities() {
  const { data, day } = state;
  const date = dateForDay(day);
  const doy = dayOfYear(date);
  const calendar = calendarFactor(date);

  // Señales aprobadas para ese día, si las hay.
  const signalsByMunicipality = indexSignals(
    data.signals?.days?.[isoDay(date)] || [],
    isoDay(date)
  );

  state.intensities = new Map();
  state.breakdown = new Map();
  state.confidence = new Map();

  for (const municipality of data.municipalities) {
    // Curva propia del municipio: el INE la publica para los destinos
    // grandes y, para el resto, sale de su marca mezclada según las plazas
    // que tiene de cada tipo. `occupancy_by_brand` queda de respaldo para
    // snapshots antiguos.
    const curve = municipality.occupancy || data.occupancy_by_brand?.[municipality.brand];
    const seasonal = occupancyOnDay(curve, doy);
    const weather = weatherFor(municipality, day);
    const dayFactor = calendar.factor * crowdFactor(weather);

    // Ocupación estimada por el modelo, antes de cualquier dato real.
    const estimated = clamp(seasonal * dayFactor, 0.02, 1);

    // Si hay señales aprobadas, corrigen la ocupación estimada.
    const signals = signalsByMunicipality.get(municipality.id) || [];
    const resolved = applySignals(municipality, estimated, signals);

    // Turismo que pernocta: plazas del IDESCAT × ocupación resultante.
    const overnight = resolved.intensity;

    // Turismo de día: no aparece en ninguna estadística de alojamiento, pero
    // es lo que llena las playas cercanas a Barcelona.
    const daytrip = daytripPressure(municipality, seasonal, dayFactor);

    state.intensities.set(municipality.id, combinedPressure(overnight, daytrip));
    state.breakdown.set(municipality.id, { overnight, daytrip });
    state.confidence.set(municipality.id, resolved);
  }

  return calendar;
}

const intensityOf = id => state.intensities.get(id) ?? 0;

// ───────────────────────────────────────────────────────────── mapa ──────

function initMap() {
  const map = L.map('map', CATALUNYA_VIEW);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 13,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a> · ' +
      'IDESCAT · <a href="https://open-meteo.com/">Open-Meteo</a>'
  }).addTo(map);

  return map;
}

const isNarrow = () => window.innerWidth <= 820;

// El panel derecho tapa el mapa en escritorio; en móvil es la hoja inferior y
// su alto cambia según esté replegada o desplegada, así que se mide en vez de
// darlo por supuesto: con un porcentaje fijo Catalunya quedaba descentrada.
function fitPadding() {
  if (!isNarrow()) return { paddingTopLeft: [24, 24], paddingBottomRight: [330, 24] };

  const height = box => Math.round(box?.getBoundingClientRect().height || 0);
  const top = height(el('legend')) + 62;   // 62: los controles y sus márgenes
  const bottom = Math.min(height(el('info-panel')), Math.round(window.innerHeight * 0.55));

  return { paddingTopLeft: [16, top + 12], paddingBottomRight: [16, bottom + 12] };
}

function fitCatalunya() {
  if (!state.bounds) {
    state.map.setView(CATALUNYA_VIEW.center, CATALUNYA_VIEW.zoom);
    return;
  }

  // `maxBounds` impide que el mapa se pierda por el Atlántico, pero cuando la
  // caja resultante es más pequeña que la ventana Leaflet la centra a la
  // fuerza y anula el desplazamiento que pide el encuadre. En móvil eso dejaba
  // media Catalunya debajo de la hoja. Se libera antes de encajar y se vuelve
  // a poner englobando la vista que ha quedado.
  state.map.setMaxBounds(null);
  state.map.fitBounds(state.bounds, { ...fitPadding(), animate: false });
  state.map.setMaxBounds(state.bounds.pad(0.35).extend(state.map.getBounds()));
}

// ──────────────────────────────────────────────────────── estado visual ──

function setStatus(kind, message) {
  const box = el('status');
  if (!kind) {
    box.removeAttribute('data-state');
    return;
  }
  box.dataset.state = kind;
  el('status-text').textContent = message;
}

// ───────────────────────────────────────────────────────────── leyenda ───

const RANGES = {
  critica: '> 80%',
  alta: '60-80%',
  media: '40-60%',
  moderada: '20-40%',
  baja: '< 20%'
};

function renderLegend() {
  el('legend-items').innerHTML = LEVELS.map(level => `
    <div class="legend-item">
      <span class="legend-swatch" style="background:${level.color}"></span>
      <span class="label">${level.label}</span>
      <span class="range">${RANGES[level.key]}</span>
    </div>
  `).join('');
}

// ───────────────────────────────────────────────────────── panel lateral ─

function renderDay(calendar) {
  const date = dateForDay(state.day);

  el('day-date').textContent = date.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const notes = [];
  if (calendar.reasons.length) notes.push(calendar.reasons.join(' · '));
  if (calendar.factor > 1.03) notes.push('más afluencia de lo normal');
  else if (calendar.factor < 0.97) notes.push('día entre semana, menos afluencia');

  el('day-note').textContent = notes.join(' — ');

  document.querySelectorAll('.day-tab').forEach(tab => {
    tab.classList.toggle('active', Number(tab.dataset.day) === state.day);
    tab.setAttribute('aria-selected', String(Number(tab.dataset.day) === state.day));
  });
}

function renderStats() {
  const municipalities = state.data.municipalities;
  const withData = municipalities.filter(m => m.has_real_data);

  const average = withData.length
    ? withData.reduce((sum, m) => sum + intensityOf(m.id), 0) / withData.length
    : 0;

  const critical = municipalities.filter(m => intensityOf(m.id) > 0.8).length;

  el('stat-critical').textContent = integer.format(critical);
  el('stat-average').textContent = `${(average * 100).toFixed(0)}%`;
  el('stat-coastal').textContent = integer.format(municipalities.filter(m => m.coastal).length);
}

function weatherChip(weather) {
  if (!weather) return '<span class="chip chip-muted">sin previsión</span>';
  const { icon } = describeWeather(weather.code);
  const temp = weather.tempMax === null ? '—' : `${Math.round(weather.tempMax)}°`;
  return `<span class="chip">${icon} ${temp}</span>`;
}

/**
 * "¿A qué playa voy?" — municipios costeros ordenados por buen tiempo y poca
 * gente. Es lo que la aplicación existe para responder.
 */
function renderBeaches() {
  const beaches = state.data.municipalities
    .filter(m => m.coastal)
    .map(m => {
      const weather = weatherFor(m, state.day);
      const conditions = beachScore(weather);
      const crowding = intensityOf(m.id);
      return {
        municipality: m,
        weather,
        conditions,
        crowding,
        // Buen tiempo pesa más, pero la masificación penaliza de verdad.
        score: conditions === null ? null : conditions * (1 - 0.45 * crowding)
      };
    });

  const ranked = beaches.every(b => b.score === null)
    // Sin meteorología solo se puede ordenar por tranquilidad.
    ? beaches.sort((a, b) => a.crowding - b.crowding)
    : beaches.filter(b => b.score !== null).sort((a, b) => b.score - a.score);

  el('beach-list').innerHTML = ranked.slice(0, 6).map(entry => {
    const level = levelFor(entry.crowding);
    return `
      <button class="rank-item" type="button" data-id="${entry.municipality.id}">
        <span class="name">${entry.municipality.name}</span>
        ${weatherChip(entry.weather)}
        <span class="pill" style="background:${level.color};color:${TEXT_COLOR[level.key]}">
          ${level.label}
        </span>
      </button>`;
  }).join('');

  el('beach-note').textContent = state.weather
    ? 'Ordenadas por tiempo de playa y poca afluencia.'
    : 'Sin previsión meteorológica: ordenadas solo por menor afluencia.';
}

function renderBusiest() {
  const top = [...state.data.municipalities]
    .map(m => ({ m, intensity: intensityOf(m.id) }))
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 6);

  el('busiest-list').innerHTML = top.map(({ m, intensity }, index) => `
    <button class="rank-item compact" type="button" data-id="${m.id}">
      <span class="rank">${index + 1}</span>
      <span class="name" title="${m.name} · ${m.comarca}">${m.coastal ? '🏖️ ' : ''}${m.name}</span>
      <span class="value" style="color:${TEXT_COLOR[levelFor(intensity).key]}">
        ${(intensity * 100).toFixed(0)}%
      </span>
    </button>
  `).join('');
}

function renderAll() {
  const calendar = computeIntensities();
  state.choropleth?.setIntensities(state.intensities);
  renderDay(calendar);
  renderStats();
  renderBeaches();
  renderBusiest();

  // Con la lista de búsqueda abierta, cambiar de día dejaría porcentajes de
  // ayer a la vista.
  if (!el('search-results').hidden) renderSearch(el('search-input').value);
}

// ──────────────────────────────────────────────────────────── buscador ───

// Son 947 municipios y el mapa solo permite llegar a los que se ven. Sin
// buscador no hay forma de responder a "¿cómo está mi pueblo hoy?".

// Sin acentos y en minúsculas: quien busca "berga" o "Bergà" espera lo mismo,
// y en un teclado de móvil nadie pone la diéresis de "Lloçà".
const normalize = text =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const SEARCH_LIMIT = 8;

function matchMunicipalities(query) {
  const needle = normalize(query.trim());
  if (needle.length < 2) return [];

  const starts = [];
  const contains = [];

  for (const municipality of state.data.municipalities) {
    const name = normalize(municipality.name);
    if (name.startsWith(needle)) starts.push(municipality);
    else if (name.includes(needle)) contains.push(municipality);
    if (starts.length >= SEARCH_LIMIT) break;
  }

  // Los que empiezan por lo tecleado van primero: "Sant" debe ofrecer
  // "Sant Adrià" antes que "Vilassar de Mar" por contener "sant".
  return [...starts, ...contains].slice(0, SEARCH_LIMIT);
}

function closeSearch() {
  const results = el('search-results');
  results.hidden = true;
  results.innerHTML = '';
}

function renderSearch(query) {
  const results = el('search-results');

  if (!state.data || normalize(query.trim()).length < 2) {
    closeSearch();
    return;
  }

  const found = matchMunicipalities(query);

  if (!found.length) {
    results.innerHTML = '<p class="search-empty">Ningún municipio con ese nombre.</p>';
    results.hidden = false;
    return;
  }

  results.innerHTML = found.map(municipality => {
    const intensity = intensityOf(municipality.id);
    const level = levelFor(intensity);
    return `
      <button class="search-result" type="button" role="option" aria-selected="false"
              data-id="${municipality.id}">
        <span class="name">${municipality.coastal ? '🏖️ ' : ''}${municipality.name}</span>
        <span class="where">${municipality.comarca}</span>
        <span class="value" style="color:${TEXT_COLOR[level.key]}">${(intensity * 100).toFixed(0)}%</span>
      </button>`;
  }).join('');

  results.hidden = false;
}

// ────────────────────────────────────────────── hoja inferior (móvil) ────

function setSheet(open, { refit = true } = {}) {
  el('info-panel').dataset.sheet = open ? 'full' : 'peek';

  const handle = el('sheet-handle');
  handle.setAttribute('aria-expanded', String(open));
  handle.querySelector('.sr-only').textContent =
    open ? 'Replegar el panel' : 'Desplegar el panel';

  // El hueco libre del mapa cambia, así que Catalunya se recoloca. Se espera a
  // que acabe la transición de 220 ms: antes, la hoja aún tapa lo que no toca.
  if (refit) setTimeout(fitCatalunya, 240);
}

/** Lleva el mapa a un municipio; en móvil repliega la hoja para que se vea. */
function focusMunicipality(id) {
  // Sin `refit`: el encuadre lo manda el municipio, no Catalunya entera.
  if (isNarrow()) setSheet(false, { refit: false });
  state.choropleth?.focus(state.map, id);
}

// ───────────────────────────────────────────────────── ficha de municipio ─

function popupHtml(municipality) {
  const intensity = intensityOf(municipality.id);
  const level = levelFor(intensity);
  const weather = weatherFor(municipality, state.day);
  const where = [municipality.comarca, municipality.provincia].filter(Boolean).join(' · ');

  const forecast = weather
    ? `
      <div class="popup-weather">
        <span class="icon">${describeWeather(weather.code).icon}</span>
        <div>
          <strong>${describeWeather(weather.code).label}</strong><br>
          ${weather.tempMax === null ? '' : `${Math.round(weather.tempMax)}° máx · `}
          ${weather.wind === null ? '' : `viento ${Math.round(weather.wind)} km/h`}
          ${weather.rain ? ` · ${decimal.format(weather.rain)} mm` : ''}
        </div>
      </div>`
    : '';

  const capacity = municipality.total_places > 0
    ? `<dl>
        <dt>Plazas turísticas</dt><dd>${integer.format(municipality.total_places)}</dd>
        <dt>Plazas por km²</dt><dd>${decimal.format(municipality.places_per_km2)}</dd>
        ${municipality.places_per_capita !== null && municipality.places_per_capita !== undefined
          ? `<dt>Plazas por habitante</dt><dd>${decimal.format(municipality.places_per_capita)}</dd>`
          : ''}
        ${municipality.population
          ? `<dt>Habitantes</dt><dd>${integer.format(municipality.population)}</dd>`
          : ''}
       </dl>`
    : '<p class="no-data">Sin plazas de alojamiento en el IDESCAT.</p>';

  // Se muestran las dos componentes en vez de afirmar cuál manda: así se ve
  // qué parte es dato del IDESCAT y qué parte es estimación.
  const parts = state.breakdown.get(municipality.id) || { overnight: 0, daytrip: 0 };
  const split = municipality.coastal
    ? `<p class="no-data">
         Pernocta ${(parts.overnight * 100).toFixed(0)}% (IDESCAT) ·
         excursión ${(parts.daytrip * 100).toFixed(0)}% (estimado)
       </p>`
    : '';

  // De qué está hecha la cifra: modelo, o modelo corregido con datos reales.
  const resolved = state.confidence.get(municipality.id);
  const badge = CONFIDENCE_LABELS[resolved?.confidence || 'estimated'];
  const sources = (resolved?.provenance.sources || [])
    .filter(source => source.url)
    .map(source => `<a href="${source.url}" target="_blank" rel="noopener">${source.source_id}</a>`)
    .join(' · ');

  // El color mide saturación ABSOLUTA. Cuando además hay una medición, se
  // muestra aparte cuánto se desvía de lo normal para ese día: son dos
  // preguntas distintas ("¿estará lleno?" y "¿está más vacío que de
  // costumbre?") y mezclarlas en un solo número las estropea las dos.
  const measured = resolved?.provenance.measured;
  const expected = resolved?.provenance.base;
  let delta = '';
  if (measured !== null && measured !== undefined && expected !== undefined) {
    const diff = measured - expected;
    if (Math.abs(diff) >= 0.1) {
      delta = `<p class="delta ${diff < 0 ? 'below' : 'above'}">
        Ocupación medida ${(measured * 100).toFixed(0)}% ·
        ${diff < 0 ? 'por debajo' : 'por encima'} de lo normal
        (el modelo esperaba ${(expected * 100).toFixed(0)}%)
      </p>`;
    }
  }

  // De dónde sale la curva de ocupación: medida para este municipio, para su
  // marca turística, o deducida de las pernoctaciones.
  const OCCUPANCY_ORIGIN = {
    municipio: 'Base: ocupación que mide el INE en este municipio',
    marca: `Base: ocupación que mide el INE en ${municipality.brand}`,
    pernoctaciones: 'Base: ocupación deducida de las pernoctaciones (IDESCAT)'
  };
  const origin = OCCUPANCY_ORIGIN[municipality.occupancy_source];

  const provenance = `
    ${delta}
    ${origin ? `<p class="provenance">${origin}</p>` : ''}
    <p class="provenance" title="${badge.note}">
      ${badge.icon} ${badge.label}${sources ? ` — ${sources}` : ''}
    </p>`;

  return `
    <div class="muni-popup">
      <h4>${municipality.coastal ? '🏖️ ' : ''}${municipality.name}</h4>
      <div class="muni-where">${where}</div>
      ${forecast}
      <div class="level" style="background:${level.color}">
        Afluencia ${level.label.toLowerCase()} · ${(intensity * 100).toFixed(0)}%
      </div>
      ${capacity}
      ${split}
      ${provenance}
    </div>`;
}

/**
 * Antigüedad de los datos reales. Que el mapa funcione sin agentes es una
 * virtud, pero el usuario tiene que poder distinguir "hay señal fresca" de
 * "esto es solo el modelo".
 */
function renderFreshness() {
  const box = el('freshness');
  const asOf = state.data?.signals?.as_of;

  if (!asOf) {
    box.textContent = 'Solo modelo · sin datos de agentes';
    box.dataset.state = 'model';
    return;
  }

  const ageHours = (Date.now() - new Date(asOf).getTime()) / 3600000;
  const age = ageHours < 1
    ? 'hace menos de 1 h'
    : ageHours < 24
      ? `hace ${Math.round(ageHours)} h`
      : `hace ${Math.round(ageHours / 24)} d`;

  box.textContent = `Datos de agentes · ${age}`;
  box.dataset.state = ageHours < 12 ? 'fresh' : ageHours < 48 ? 'aging' : 'stale';
}

// ───────────────────────────────────────────────────────────── carga ─────

async function loadWeather() {
  const points = state.data.weather_points;
  if (!Array.isArray(points) || !points.length) return;

  el('weather-status').textContent = 'Consultando previsión…';

  try {
    const forecast = await fetchForecast(points, { days: HORIZON_DAYS });
    const resolved = forecast.filter(Boolean).length;

    if (!resolved) throw new Error('ningún punto devolvió previsión');

    state.weather = forecast;
    el('weather-status').textContent = `Previsión Open-Meteo · ${resolved}/${points.length} puntos`;
    console.log(`🌤️ Previsión cargada para ${resolved}/${points.length} puntos`);
  } catch (error) {
    state.weather = null;
    el('weather-status').textContent = 'Sin previsión meteorológica (estimación IDESCAT)';
    console.warn('⚠️ Meteorología no disponible:', error.message);
  }

  renderAll();
}

async function load({ bustCache = false } = {}) {
  const refresh = el('btn-refresh');
  refresh.disabled = true;
  setStatus('loading', 'Cargando datos…');

  try {
    const { data, source, degraded } = await loadTourismData(DATA_URLS, { bustCache });
    state.data = data;

    if (state.choropleth) state.map.removeLayer(state.choropleth.layer);

    state.choropleth = await createMunicipalityLayer(data.municipalities, popupHtml);
    state.choropleth.layer.addTo(state.map);

    state.bounds = state.choropleth.layer.getBounds();
    fitCatalunya(); // fija también el límite de desplazamiento

    renderAll();

    el('legend-coverage').textContent =
      `${state.choropleth.matched}/${state.choropleth.total} municipios`;

    renderFreshness();

    setStatus(degraded ? 'warning' : null,
      degraded ? 'Mostrando datos de respaldo: no se pudo leer el fichero actual.' : '');

    console.log(`✅ Cargado desde ${source}: ${data.municipalities.length} municipios`);

    // La meteorología llega después: el mapa ya es usable sin ella.
    loadWeather();
  } catch (error) {
    console.error('❌ Error cargando los datos:', error);
    const detail = error instanceof DataLoadError
      ? error.attempts.map(a => `${a.url}: ${a.message}`).join(' · ')
      : error.message;
    setStatus('error', `No se pudo cargar el mapa. ${detail}`);
  } finally {
    refresh.disabled = false;
  }
}

// ────────────────────────────────────────────────────────── interacción ──

function bindEvents() {
  el('btn-refresh').addEventListener('click', () => load({ bustCache: true }));

  el('btn-reset').addEventListener('click', () => {
    state.map.closePopup();
    fitCatalunya();
  });

  document.querySelectorAll('.day-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      state.day = Number(tab.dataset.day);
      if (state.data) renderAll();
      else renderDay(calendarFactor(dateForDay(state.day)));
    });
  });

  // Delegación: las listas se repintan al cambiar de día.
  for (const listId of ['beach-list', 'busiest-list']) {
    el(listId).addEventListener('click', event => {
      const item = event.target.closest('.rank-item');
      if (item) focusMunicipality(item.dataset.id);
    });
  }

  // ── buscador ──
  const search = el('search-input');

  search.addEventListener('input', () => renderSearch(search.value));

  search.addEventListener('focus', () => {
    // Con la hoja replegada la lista de resultados caería fuera de pantalla.
    if (isNarrow()) setSheet(true, { refit: false });
    renderSearch(search.value);
  });

  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      search.value = '';
      closeSearch();
      search.blur();
      return;
    }
    // Enter sin elegir nada va al primer resultado: es lo que espera quien
    // escribe el nombre entero y pulsa intro.
    if (event.key === 'Enter') {
      const first = el('search-results').querySelector('.search-result');
      if (first) first.click();
    }
  });

  el('search-results').addEventListener('click', event => {
    const item = event.target.closest('.search-result');
    if (!item) return;
    search.value = '';
    closeSearch();
    search.blur();
    focusMunicipality(item.dataset.id);
  });

  // Un clic fuera cierra la lista; si no, se queda flotando sobre el ranking.
  document.addEventListener('click', event => {
    if (!event.target.closest('.search')) closeSearch();
  });

  // ── hoja inferior (móvil) ──
  el('sheet-handle').addEventListener('click', () => {
    setSheet(el('info-panel').dataset.sheet !== 'full');
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitCatalunya, 250);
  });
}

// ─────────────────────────────────────────────────────────── arranque ────

state.map = initMap();
renderLegend();
renderDay(calendarFactor(dateForDay(0)));
bindEvents();
load();
