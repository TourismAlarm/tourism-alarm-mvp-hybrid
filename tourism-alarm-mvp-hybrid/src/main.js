// 🚨 Tourism Alarm Catalunya — arranque de la aplicación

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';

import { loadTourismData, DataLoadError } from './data/fetchData.js';
import { createMunicipalityLayer, LEVELS, levelFor } from './map/municipalityLayer.js';

const DATA_URLS = ['/data/current.json', '/data/last-good.json'];

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Contexto turístico de cada mes, resumido de la propia estacionalidad IDESCAT.
const MONTH_CONTEXT = [
  { badge: '❄️ Temporada baja', note: 'Costa prácticamente vacía. La presión se concentra en Barcelona y en el Pirineo por la temporada de esquí.' },
  { badge: '❄️ Temporada baja', note: 'Mes punta en Val d’Aran y Cerdanya. El litoral sigue en mínimos anuales.' },
  { badge: '🌱 Transición', note: 'Arranca la actividad en la costa. Semana Santa dispara los Pirineos y la Costa Brava.' },
  { badge: '🌸 Temporada media', note: 'La costa se reactiva con fuerza; el interior mantiene niveles bajos.' },
  { badge: '🌸 Temporada media', note: 'Buen momento para visitar el litoral sin llegar a los niveles de verano.' },
  { badge: '☀️ Inicio temporada alta', note: 'Costa Brava y Costa Daurada se acercan a su máximo. Empiezan las aglomeraciones.' },
  { badge: '🔥 Temporada alta', note: 'Ocupación muy alta en todo el litoral y en el Pirineo de montaña.' },
  { badge: '🔥 Máximo anual', note: 'Pico de saturación del año. Salou, Lloret y la Costa Barcelona en niveles críticos.' },
  { badge: '🍂 Fin de temporada alta', note: 'Sigue habiendo presión alta en la costa, pero baja respecto a agosto.' },
  { badge: '🍂 Temporada media-baja', note: 'Descenso rápido en el litoral. Barcelona mantiene ocupación alta por congresos.' },
  { badge: '🍂 Temporada baja', note: 'Mínimo anual en la costa. El Pirineo empieza a prepararse para la nieve.' },
  { badge: '🎄 Temporada media', note: 'Navidad reactiva ciudades y estaciones de esquí; la costa sigue en mínimos.' }
];

const CATALUNYA_VIEW = {
  center: [41.75, 1.6],
  zoom: 8,
  minZoom: 7,
  maxZoom: 13,
  maxBoundsViscosity: 0.85,
  zoomControl: false,
  // Sin esto fitBounds redondea el zoom hacia abajo y Catalunya queda pequeña
  // en medio de la pantalla.
  zoomSnap: 0.25,
  zoomDelta: 0.5
};

// Margen que dejan los paneles flotantes. En escritorio el panel está a la
// derecha; por debajo de 820px pasa a ocupar la franja inferior, así que el
// hueco que hay que reservar cambia de lado.
function fitPadding() {
  const narrow = window.innerWidth <= 820;
  return narrow
    ? { paddingTopLeft: [16, 128], paddingBottomRight: [16, Math.round(window.innerHeight * 0.44)] }
    : { paddingTopLeft: [24, 24], paddingBottomRight: [330, 24] };
}

const integer = new Intl.NumberFormat('es-ES');
const el = id => document.getElementById(id);

// ───────────────────────────────────────────────────────────── estado ────

const state = {
  map: null,
  choropleth: null,
  data: null,
  bounds: null,
  month: new Date().getMonth() + 1
};

function fitCatalunya() {
  if (state.bounds) {
    state.map.fitBounds(state.bounds, fitPadding());
  } else {
    state.map.setView(CATALUNYA_VIEW.center, CATALUNYA_VIEW.zoom);
  }
}

// ───────────────────────────────────────────────────────────── mapa ──────

function initMap() {
  const map = L.map('map', CATALUNYA_VIEW);

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 13,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a> · datos: IDESCAT'
  }).addTo(map);

  return map;
}

// ──────────────────────────────────────────────────────── estado visual ──

function setStatus(stateName, message) {
  const box = el('status');
  if (!box) return;

  if (!stateName) {
    box.removeAttribute('data-state');
    return;
  }

  box.dataset.state = stateName;
  el('status-text').textContent = message;
}

// ───────────────────────────────────────────────────────────── leyenda ───

function renderLegend() {
  const ranges = {
    critica: '> 80%',
    alta: '60-80%',
    media: '40-60%',
    moderada: '20-40%',
    baja: '< 20%'
  };

  el('legend-items').innerHTML = LEVELS.map(level => `
    <div class="legend-item">
      <span class="legend-swatch" style="background:${level.color}"></span>
      <span class="label">${level.label}</span>
      <span class="range">${ranges[level.key]}</span>
    </div>
  `).join('');
}

// ───────────────────────────────────────────────────────── panel lateral ─

function intensityFor(muni, month) {
  const monthly = muni.monthly_intensity || {};
  return monthly[month] ?? monthly[String(month)] ?? muni.tourism_intensity ?? 0;
}

function renderStats() {
  const { data, month } = state;
  const municipalities = data.municipalities;

  const withData = municipalities.filter(m => m.has_real_data);
  const intensities = withData.map(m => intensityFor(m, month));
  const average = intensities.length
    ? intensities.reduce((sum, value) => sum + value, 0) / intensities.length
    : 0;

  const critical = municipalities.filter(m => intensityFor(m, month) > 0.8).length;
  const totalPlaces = municipalities.reduce((sum, m) => sum + (m.total_places || 0), 0);

  el('stat-total').textContent = integer.format(municipalities.length);
  el('stat-with-data').textContent = integer.format(withData.length);
  el('stat-places').textContent = integer.format(totalPlaces);
  el('stat-average').textContent = `${(average * 100).toFixed(0)}%`;
  el('stat-critical').textContent = integer.format(critical);
}

// Los niveles claros de la paleta no tienen contraste suficiente sobre el
// panel blanco, así que el ranking usa un tono legible por nivel.
const TOP_TEXT_COLOR = {
  critica: '#b91c1c',
  alta: '#c2410c',
  media: '#a16207',
  moderada: '#3f6212',
  baja: '#475569'
};

function renderTop() {
  const { data, month } = state;

  const top = [...data.municipalities]
    .map(m => ({ muni: m, intensity: intensityFor(m, month) }))
    .sort((a, b) => b.intensity - a.intensity)
    .slice(0, 8);

  el('top-list').innerHTML = top.map(({ muni, intensity }, index) => `
    <button class="top-item" type="button" data-id="${muni.id}">
      <span class="rank">${index + 1}</span>
      <span class="name" title="${muni.name} · ${muni.comarca}">${muni.name}</span>
      <span class="value" style="color:${TOP_TEXT_COLOR[levelFor(intensity).key]}">${(intensity * 100).toFixed(0)}%</span>
    </button>
  `).join('');
}

function renderMonth() {
  const { month } = state;
  const context = MONTH_CONTEXT[month - 1];

  el('month-name').textContent = MONTHS[month - 1];
  el('month-slider').value = String(month);
  el('season-badge').textContent = context.badge;
  el('season-note').textContent = context.note;
}

function renderAll() {
  renderMonth();
  renderStats();
  renderTop();
}

// ───────────────────────────────────────────────────────────── carga ─────

async function load({ bustCache = false } = {}) {
  const refreshButton = el('btn-refresh');
  refreshButton.disabled = true;
  setStatus('loading', 'Cargando datos del IDESCAT…');

  try {
    const { data, source, degraded } = await loadTourismData(DATA_URLS, { bustCache });
    state.data = data;

    if (state.choropleth) {
      state.map.removeLayer(state.choropleth.layer);
    }

    state.choropleth = await createMunicipalityLayer(data.municipalities);
    state.choropleth.setMonth(state.month);
    state.choropleth.layer.addTo(state.map);

    state.bounds = state.choropleth.layer.getBounds();
    state.map.setMaxBounds(state.bounds.pad(0.35));
    fitCatalunya();

    renderAll();

    const generated = data.metadata?.generated_at
      ? new Date(data.metadata.generated_at)
      : null;

    el('legend-updated').textContent = generated
      ? generated.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'desconocida';

    el('legend-coverage').textContent =
      `${state.choropleth.matched}/${state.choropleth.total} municipios con datos`;

    if (degraded) {
      setStatus('warning', 'Mostrando datos de respaldo: no se pudo leer el fichero actual.');
    } else {
      setStatus(null);
    }

    console.log(`✅ Tourism Alarm cargado desde ${source}: ${data.municipalities.length} municipios`);
  } catch (error) {
    console.error('❌ Error cargando los datos:', error);

    const detail = error instanceof DataLoadError
      ? error.attempts.map(a => `${a.url}: ${a.message}`).join(' · ')
      : error.message;

    setStatus('error', `No se pudo cargar el mapa. ${detail}`);
  } finally {
    refreshButton.disabled = false;
  }
}

// ────────────────────────────────────────────────────────── interacción ──

function bindEvents() {
  el('btn-refresh').addEventListener('click', () => load({ bustCache: true }));

  el('btn-reset').addEventListener('click', () => {
    state.map.closePopup();
    fitCatalunya();
  });

  el('month-slider').addEventListener('input', event => {
    state.month = Number(event.target.value);
    if (!state.data) {
      renderMonth();
      return;
    }
    state.choropleth?.setMonth(state.month);
    renderAll();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fitCatalunya, 250);
  });

  // Delegación: el ranking se vuelve a pintar en cada cambio de mes.
  el('top-list').addEventListener('click', event => {
    const item = event.target.closest('.top-item');
    if (item) state.choropleth?.focus(state.map, item.dataset.id);
  });
}

// ─────────────────────────────────────────────────────────── arranque ────

state.map = initMap();
renderLegend();
renderMonth();
bindEvents();
load();
