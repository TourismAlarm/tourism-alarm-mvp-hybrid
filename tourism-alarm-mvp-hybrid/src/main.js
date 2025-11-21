import L from 'leaflet';
import { fetchDataWithFallback } from './data/fetchData.js';
import { createMunicipalityLayer } from './map/municipalityLayer.js';

// 🗺️ Configuración mapa Catalunya
const CATALUNYA_CONFIG = {
    center: [41.5, 2.0],
    zoom: 8,
    minZoom: 6,
    maxZoom: 12,
    maxBounds: [
        [40.3, 0.0],
        [43.0, 3.5]
    ],
    maxBoundsViscosity: 1.0
};

const map = L.map('map', CATALUNYA_CONFIG);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 12,
  attribution: '&copy; OpenStreetMap | Tourism Alarm Catalunya'
}).addTo(map);

// 📊 Variables globales
let currentChoroLayer = null;
let municipalitiesData = null;
let activeFilters = {
  category: 'all',
  level: 'all'
};
let allLayers = new Map(); // Mapa de código -> layer

// 📅 Función para obtener mes actual
function getCurrentMonth() {
  const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return months[new Date().getMonth()];
}

// 🌡️ Función para obtener contexto de temporada
function getSeasonContext(month) {
  const seasonMap = {
    'Enero': { emoji: '❄️', name: 'Temporada Baja (Invierno)', color: '#e3f2fd', textColor: '#1976d2' },
    'Febrero': { emoji: '❄️', name: 'Temporada Baja (Invierno)', color: '#e3f2fd', textColor: '#1976d2' },
    'Marzo': { emoji: '🌸', name: 'Inicio Temporada Media', color: '#f3e5f5', textColor: '#7b1fa2' },
    'Abril': { emoji: '🌸', name: 'Temporada Media (Primavera)', color: '#f3e5f5', textColor: '#7b1fa2' },
    'Mayo': { emoji: '🌸', name: 'Temporada Media (Primavera)', color: '#f3e5f5', textColor: '#7b1fa2' },
    'Junio': { emoji: '☀️', name: 'Inicio Temporada Alta', color: '#fff3e0', textColor: '#e65100' },
    'Julio': { emoji: '🔥', name: 'Temporada Alta (Verano)', color: '#ffebee', textColor: '#c62828' },
    'Agosto': { emoji: '🔥', name: 'Temporada Alta (Verano)', color: '#ffebee', textColor: '#c62828' },
    'Septiembre': { emoji: '🍂', name: 'Temporada Media (Otoño)', color: '#fff3e0', textColor: '#e65100' },
    'Octubre': { emoji: '🍂', name: 'Temporada Baja (Otoño)', color: '#f1f8e9', textColor: '#558b2f' },
    'Noviembre': { emoji: '🍂', name: 'Temporada Baja (Otoño)', color: '#f1f8e9', textColor: '#558b2f' },
    'Diciembre': { emoji: '🎄', name: 'Temporada Media (Navidad)', color: '#e8f5e9', textColor: '#2e7d32' }
  };
  return seasonMap[month] || seasonMap['Enero'];
}

// 📊 Actualizar UI con datos
function updateUI(data) {
  // Fecha actual
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  document.getElementById('current-date').textContent = dateStr;

  // Estadísticas
  const realDataCount = data.municipalities.filter(m => m.has_real_data).length;
  const avgIntensity = data.municipalities.reduce((sum, m) => sum + m.tourism_intensity, 0) / data.municipalities.length;

  document.getElementById('total-munis').textContent = data.municipalities_count || 947;
  document.getElementById('real-data').textContent = realDataCount;
  document.getElementById('avg-intensity').textContent = `${(avgIntensity * 100).toFixed(1)}%`;

  // Top 5 municipios
  const top5 = [...data.municipalities]
    .sort((a, b) => b.tourism_intensity - a.tourism_intensity)
    .slice(0, 5);

  const topListHTML = top5.map((m, index) => {
    const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
    return `
      <div class="top-muni">
        <span class="name">${emoji} ${m.name}</span>
        <span class="value">${(m.tourism_intensity * 100).toFixed(0)}%</span>
      </div>
    `;
  }).join('');

  document.getElementById('top-list').innerHTML = topListHTML;

  // Contexto de temporada
  const month = getCurrentMonth();
  const season = getSeasonContext(month);
  const seasonBadge = document.getElementById('season-badge');
  seasonBadge.textContent = `${season.emoji} ${season.name}`;
  seasonBadge.style.background = season.color;
  seasonBadge.style.color = season.textColor;

  // Contexto informativo según temporada
  const contextTexts = {
    'Enero': 'Temporada baja en costa, alta en montaña (esquí). Los Pirineos muestran máxima saturación.',
    'Febrero': 'Temporada baja en costa, alta en montaña (esquí). Ideal para turismo urbano.',
    'Marzo': 'Transición hacia primavera. Inicio de temporada en algunas zonas costeras.',
    'Abril': 'Temporada media. Buen momento para visitar sin masificaciones.',
    'Mayo': 'Temporada media en ascenso. Costa empieza a activarse.',
    'Junio': 'Inicio de temporada alta. Costa y montaña activas.',
    'Julio': 'Pico de temporada alta. Máxima saturación en costa.',
    'Agosto': 'Máxima saturación del año. Costa en niveles críticos.',
    'Septiembre': 'Fin de temporada alta. Todavía saturación moderada-alta.',
    'Octubre': 'Temporada baja. Buena opción para evitar masificaciones.',
    'Noviembre': 'Temporada baja. Los Pirineos empiezan temporada de esquí.',
    'Diciembre': 'Temporada media por Navidad. Ciudades y montaña activas.'
  };

  document.getElementById('context-text').textContent = contextTexts[month] || 'Mapa de saturación turística de Catalunya.';

  // Hora de actualización
  const updateTime = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('update-time').textContent = updateTime;
}

// 🚀 Función principal de carga
async function loadTourismData() {
  try {
    // Mostrar loading
    const loading = document.getElementById('loading');
    if (loading) loading.style.display = 'block';

    const data = await fetchDataWithFallback('/data/current.json', '/data/last-good.json');

    if (!data || !data.municipalities) {
      throw new Error('Datos no válidos');
    }

    municipalitiesData = data;

    // Limpiar capas anteriores
    if (currentChoroLayer) {
      map.removeLayer(currentChoroLayer);
    }

    // Crear mapa coroplético
    const choroLayer = await createMunicipalityLayer(map, municipalitiesData.municipalities);
    if (choroLayer) {
      choroLayer.addTo(map);
      currentChoroLayer = choroLayer;

      // Guardar referencias a layers para búsqueda
      storeLayers(choroLayer);

      console.log('✅ Mapa coroplético cargado');
    } else {
      throw new Error('Error creando mapa coroplético');
    }

    // Actualizar UI
    updateUI(data);

    // Actualizar dashboard de cobertura
    updateCoverageDashboard(data);

    console.log('✅ Tourism Alarm cargado:', data.municipalities_count, 'municipios');

    // Ocultar loading
    if (loading) loading.style.display = 'none';

  } catch (error) {
    console.error('❌ Error cargando datos:', error);
    const loading = document.getElementById('loading');
    if (loading) {
      loading.innerHTML = '<div style="color: #c62828;">⚠️ Error cargando datos</div>';
      setTimeout(() => loading.style.display = 'none', 3000);
    }
  }
}

// 🎛️ Event listeners
document.getElementById('btn-refresh').addEventListener('click', () => {
  console.log('🔄 Actualizando datos...');
  loadTourismData();
});

// Toggle del panel de contexto
document.getElementById('btn-info').addEventListener('click', () => {
  const contextPanel = document.getElementById('context-panel');
  if (contextPanel.style.display === 'none') {
    contextPanel.style.display = 'block';
  } else {
    contextPanel.style.display = 'none';
  }
});

// 🔍 BÚSQUEDA DE MUNICIPIOS
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

if (searchInput) {
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();

    if (query.length < 2 || !municipalitiesData) {
      searchResults.style.display = 'none';
      return;
    }

    const matches = municipalitiesData.municipalities
      .filter(m => m.name.toLowerCase().includes(query))
      .slice(0, 8);

    if (matches.length === 0) {
      searchResults.style.display = 'none';
      return;
    }

    const resultsHTML = matches.map(m => {
      const intensity = (m.tourism_intensity * 100).toFixed(0);
      const color = getIntensityColor(m.tourism_intensity);
      return `
        <div class="search-result-item" data-code="${m.code}" data-lat="${m.centroid?.lat || 41.5}" data-lng="${m.centroid?.lng || 2.0}">
          <span>${m.name}</span>
          <span class="intensity" style="background: ${color}; color: ${intensity > 50 ? '#000' : '#fff'};">${intensity}%</span>
        </div>
      `;
    }).join('');

    searchResults.innerHTML = resultsHTML;
    searchResults.style.display = 'block';

    // Event listeners para resultados
    searchResults.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        const lat = parseFloat(item.dataset.lat);
        const lng = parseFloat(item.dataset.lng);
        const code = item.dataset.code;

        // Centrar mapa en el municipio
        map.setView([lat, lng], 11);

        // Abrir popup si existe la capa
        if (allLayers.has(code)) {
          allLayers.get(code).openPopup();
        }

        // Limpiar búsqueda
        searchInput.value = '';
        searchResults.style.display = 'none';
      });
    });
  });

  // Cerrar resultados al hacer click fuera
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });
}

// 🎨 Obtener color según intensidad
function getIntensityColor(intensity) {
  if (intensity > 0.8) return '#ff0000';
  if (intensity > 0.6) return '#ff8000';
  if (intensity > 0.4) return '#ffff00';
  if (intensity > 0.2) return '#66ff00';
  return '#00ff60';
}

// 🎛️ FILTROS
function setupFilters() {
  // Filtros de categoría
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Actualizar botón activo
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      activeFilters.category = btn.dataset.filter;
      applyFilters();
    });
  });

  // Filtros de nivel
  document.querySelectorAll('[data-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Actualizar botón activo
      document.querySelectorAll('[data-level]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      activeFilters.level = btn.dataset.level;
      applyFilters();
    });
  });
}

// 🔄 Aplicar filtros al mapa
function applyFilters() {
  if (!currentChoroLayer || !municipalitiesData) return;

  currentChoroLayer.eachLayer(layer => {
    const feature = layer.feature;
    if (!feature) return;

    const muni = municipalitiesData.municipalities.find(m => String(m.code) === String(feature.id));
    if (!muni) return;

    let visible = true;

    // Filtro de categoría
    if (activeFilters.category !== 'all') {
      if (muni.categoria !== activeFilters.category) {
        visible = false;
      }
    }

    // Filtro de nivel
    if (activeFilters.level !== 'all' && visible) {
      const intensity = muni.tourism_intensity;
      if (activeFilters.level === 'high' && intensity <= 0.6) visible = false;
      if (activeFilters.level === 'medium' && (intensity <= 0.3 || intensity > 0.6)) visible = false;
      if (activeFilters.level === 'low' && intensity > 0.3) visible = false;
    }

    // Aplicar visibilidad
    if (visible) {
      layer.setStyle({ fillOpacity: 0.7, opacity: 1 });
    } else {
      layer.setStyle({ fillOpacity: 0.1, opacity: 0.2 });
    }
  });

  // Actualizar contador de filtrados
  updateFilteredCount();
}

// 📊 Actualizar contador de municipios filtrados
function updateFilteredCount() {
  if (!municipalitiesData) return;

  let count = 0;
  municipalitiesData.municipalities.forEach(muni => {
    let visible = true;

    if (activeFilters.category !== 'all' && muni.categoria !== activeFilters.category) {
      visible = false;
    }

    if (activeFilters.level !== 'all' && visible) {
      const intensity = muni.tourism_intensity;
      if (activeFilters.level === 'high' && intensity <= 0.6) visible = false;
      if (activeFilters.level === 'medium' && (intensity <= 0.3 || intensity > 0.6)) visible = false;
      if (activeFilters.level === 'low' && intensity > 0.3) visible = false;
    }

    if (visible) count++;
  });

  console.log(`📊 Municipios visibles: ${count}/${municipalitiesData.municipalities.length}`);
}

// 📈 Actualizar dashboard de cobertura
function updateCoverageDashboard(data) {
  const total = data.municipalities.length;
  const realData = data.municipalities.filter(m => m.has_real_data).length;
  const percent = ((realData / total) * 100).toFixed(1);

  const coverageBar = document.getElementById('coverage-bar');
  const coverageCount = document.getElementById('coverage-count');
  const coveragePercent = document.getElementById('coverage-percent');

  if (coverageBar) coverageBar.style.width = `${percent}%`;
  if (coverageCount) coverageCount.textContent = `${realData} / ${total} municipios`;
  if (coveragePercent) coveragePercent.textContent = `${percent}%`;
}

// 🗺️ Guardar referencia a layers para búsqueda
function storeLayers(geoJsonLayer) {
  if (!geoJsonLayer) return;

  geoJsonLayer.eachLayer(layer => {
    const feature = layer.feature;
    if (feature && feature.id) {
      allLayers.set(String(feature.id), layer);
    }
  });
}

// Inicializar filtros cuando se carga la página
setupFilters();

// 🚀 Arranque inicial
loadTourismData();
