import L from 'leaflet';
// import 'leaflet.heat';  // COMENTADO: Solo usamos mapa coroplético
import { fetchDataWithFallback } from './data/fetchData.js';
import { updateInfoPanel } from './ui/infoPanel.js';
// import { createHeatLayer } from './map/heatLayer.js';  // COMENTADO: Solo coroplético
import { createMunicipalityLayer } from './map/municipalityLayer.js';

// 🗺️ Configuración mapa Catalunya centrado perfectamente con límites MVP
const CATALUNYA_CONFIG = {
    center: [41.5, 2.0],            // Centro geográfico Catalunya
    zoom: 8,                        // Zoom óptimo territorio completo
    minZoom: 6,                     // No zoom out excesivo
    maxZoom: 12,                    // No zoom in excesivo (límite MVP)
    maxBounds: [                    // Límites exactos Catalunya
        [40.3, 0.0],               // SO expandido
        [43.0, 3.5]                // NE expandido
    ],
    maxBoundsViscosity: 1.0         // Prevenir salir de Catalunya
};

const map = L.map('map', CATALUNYA_CONFIG);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 12,  // Sincronizar con límite de mapa
  attribution: '&copy; OpenStreetMap | Tourism Alarm Catalunya'
}).addTo(map);

// 📊 Variables globales
// let currentHeatLayer = null;  // COMENTADO: Solo usamos coroplético
let currentChoroLayer = null;
let municipalitiesData = null;

// 🚀 Función principal de carga
async function loadTourismData() {
  try {
    updateInfoPanel('🔄 Conectando a datos de Catalunya...', null);

    const data = await fetchDataWithFallback('/data/current.json', '/data/last-good.json');

    if (!data || !data.points) {
      throw new Error('Datos no válidos');
    }

    municipalitiesData = data;

    // Limpiar capas anteriores
    // if (currentHeatLayer) {  // COMENTADO: Solo usamos coroplético
    //   map.removeLayer(currentHeatLayer);
    // }
    if (currentChoroLayer) {
      map.removeLayer(currentChoroLayer);
    }

    // Crear SOLO mapa coroplético (sin heatmap)
    const choroLayer = await createMunicipalityLayer(map, municipalitiesData.municipalities);
    if (choroLayer) {
      choroLayer.addTo(map);
      currentChoroLayer = choroLayer;
      console.log('✅ Mapa coroplético cargado (sin heatmap)');
    } else {
        throw new Error('Error creando mapa coroplético');
    }

    // COMENTADO: Ya no usamos heatmap para mejor visualización
    // currentHeatLayer = createHeatLayer(data.points, map);
    // if (currentHeatLayer) {
    //     currentHeatLayer.addTo(map);
    //     console.log('🎯 Heatmap Catalunya cargado correctamente');
    // } else {
    //     throw new Error('Error creando heatmap');
    // }

    // Actualizar UI
    updateInfoPanel(
      `✅ Datos actualizados ${new Date(data.updated_at).toLocaleTimeString('es-ES')}`,
      {
        municipalities: data.municipalities_count,
        realCoords: data.real_coordinates_count,
        points: data.points.length
      }
    );

    console.log('✅ Tourism Alarm cargado:', data.municipalities_count, 'municipios');

  } catch (error) {
    console.error('❌ Error cargando datos:', error);
    updateInfoPanel('⚠️ Error cargando datos turísticos', null);
  }
}

// 🎛️ Event listeners
document.getElementById('btn-refresh').addEventListener('click', () => {
  loadTourismData();
});

document.getElementById('btn-info').addEventListener('click', () => {
  if (municipalitiesData) {
    const stats = municipalitiesData.statistics || {};
    alert(`Tourism Alarm Catalunya\n\nMunicipios: ${municipalitiesData.municipalities_count}\nCoordinadas reales: ${municipalitiesData.real_coordinates_count}\nPuntos heatmap: ${municipalitiesData.points?.length || 0}\n\nIntensidad turística:\n• Mínima: ${stats.min || 'N/A'}\n• Máxima: ${stats.max || 'N/A'}\n• Promedio: ${stats.avg || 'N/A'}\n\nÚltima actualización: ${new Date(municipalitiesData.updated_at).toLocaleString('es-ES')}`);
  } else {
    alert('No hay datos cargados');
  }
});

// 🚀 Arranque inicial
loadTourismData();
