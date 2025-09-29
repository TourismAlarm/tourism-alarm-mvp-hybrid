// 🎯 HEATMAP OPTIMIZADO PARA CATALUNYA (RESTAURADO + MEJORADO)
import 'leaflet.heat';

// Configuración específica por zoom level (restaurada con mejoras)
const HEATMAP_CONFIGS = {
  low: {     // zoom 6-7 (vista Catalunya completa)
    radius: 60,
    blur: 45,
    minOpacity: 0.2,
    max: 0.9
  },
  medium: {  // zoom 8-10 (vista regional)
    radius: 50,
    blur: 35,
    minOpacity: 0.2,
    max: 0.9
  },
  high: {    // zoom 11+ (vista local)
    radius: 45,
    blur: 30,
    minOpacity: 0.2,
    max: 0.9
  }
};

// Gradiente restaurado (verde→amarillo→rojo que funcionaba)
const CATALUNYA_GRADIENT = {
  0.0: 'transparent',
  0.1: '#00ff60',    // Verde claro - muy baja
  0.3: '#66ff00',    // Verde - baja
  0.5: '#ffff00',    // Amarillo - media
  0.7: '#ff8000',    // Naranja - alta
  0.9: '#ff4000',    // Rojo-naranja - muy alta
  1.0: '#ff0000'     // Rojo - crítica
};

export function createHeatLayer(points, map) {
  console.log(`🔥 Creando heatmap Catalunya restaurado con ${points.length} puntos`);

  // Validar puntos (mantener validación exacta)
  const validPoints = points.filter(point => {
    if (!Array.isArray(point) || point.length < 3) return false;
    const [lat, lng, intensity] = point;

    // Validar coordenadas Catalunya (mantiene la forma exacta)
    const validCoords = lat >= 40.52 && lat <= 42.86 &&
                       lng >= 0.16 && lng <= 3.33;

    // Validar intensidad
    const validIntensity = intensity >= 0 && intensity <= 1;

    if (!validCoords) {
      console.warn(`⚠️ Punto fuera de Catalunya: [${lat}, ${lng}]`);
    }

    return validCoords && validIntensity;
  });

  console.log(`✅ ${validPoints.length} puntos válidos para heatmap Catalunya`);

  if (validPoints.length === 0) {
    console.error('❌ No hay puntos válidos para crear heatmap');
    return null;
  }

  // Configuración inicial
  const zoom = map.getZoom();
  const config = getConfigForZoom(zoom);

  // Crear heatmap layer (restaurado)
  const heatLayer = L.heatLayer(validPoints, {
    ...config,
    gradient: CATALUNYA_GRADIENT
  });

  // Event listener para zoom dinámico (restaurado)
  map.on('zoomend', () => {
    const newZoom = map.getZoom();
    const newConfig = getConfigForZoom(newZoom);

    heatLayer.setOptions({
      ...newConfig,
      gradient: CATALUNYA_GRADIENT
    });

    console.log(`🔄 Heatmap Catalunya actualizado para zoom ${newZoom}`);
  });

  console.log(`🎯 Heatmap Catalunya restaurado con configuración zoom ${zoom}`);
  return heatLayer;
}

function getConfigForZoom(zoom) {
  if (zoom <= 7) return HEATMAP_CONFIGS.low;
  if (zoom <= 10) return HEATMAP_CONFIGS.medium;
  return HEATMAP_CONFIGS.high;
}

// Función de debugging restaurada
export function debugHeatmap(heatLayer, points) {
  console.log('🔍 DEBUG HEATMAP CATALUNYA:');
  console.log(`- Puntos totales: ${points.length}`);
  console.log(`- Layer válido: ${!!heatLayer}`);
  console.log(`- Configuración actual:`, heatLayer.options);

  // Analizar distribución intensidades
  const intensities = points.map(p => p[2]);
  console.log('📊 Distribución intensidades:', {
    min: Math.min(...intensities),
    max: Math.max(...intensities),
    promedio: (intensities.reduce((a,b) => a+b) / intensities.length).toFixed(2)
  });

  // Verificar forma Catalunya
  const bounds = {
    north: Math.max(...points.map(p => p[0])),
    south: Math.min(...points.map(p => p[0])),
    east: Math.max(...points.map(p => p[1])),
    west: Math.min(...points.map(p => p[1]))
  };

  console.log('🗺️ Límites:', bounds);
  const shapeOk = bounds.north < 42.9 && bounds.south > 40.5 &&
                  bounds.east < 3.4 && bounds.west > 0.1;
  console.log(`📐 Forma Catalunya: ${shapeOk ? '✅ CORRECTA' : '❌ ROTA'}`);
}