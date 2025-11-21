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
      console.log('✅ Mapa coroplético cargado');
    } else {
      throw new Error('Error creando mapa coroplético');
    }

    // Actualizar UI
    updateUI(data);

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

// 🚀 Arranque inicial
loadTourismData();
