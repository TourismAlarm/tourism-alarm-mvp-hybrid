// 🎯 HEATMAP OPTIMIZADO ALTA DENSIDAD - SISTEMA MULTIPUNTO CATALUNYA
import 'leaflet.heat';

// Configuración adaptativa para 66,000+ puntos - Evita sobresaturación
const HEATMAP_CONFIGS = {
  low: {     // zoom 6-7 (vista Catalunya completa) - Reducido para alta densidad
    radius: 35,    // Reducido de 60 para evitar sobresaturación
    blur: 25,      // Reducido de 45 para mejor definición
    minOpacity: 0.15,
    max: 0.7       // Reducido para evitar saturación con tantos puntos
  },
  medium: {  // zoom 8-10 (vista regional) - Optimizado para densidad media
    radius: 28,    // Reducido de 50
    blur: 20,      // Reducido de 35
    minOpacity: 0.12,
    max: 0.8
  },
  high: {    // zoom 11+ (vista local) - Detalle fino
    radius: 20,    // Reducido de 45 para mejor detalle
    blur: 15,      // Reducido de 30
    minOpacity: 0.1,
    max: 1.0       // Máximo solo en zoom alto
  }
};

// Gradiente mejorado para alta densidad - Más transiciones suaves
const CATALUNYA_GRADIENT = {
  0.0: 'transparent',
  0.1: '#00ff80',    // Verde muy claro - densidad mínima
  0.25: '#40ff40',   // Verde claro - baja densidad
  0.4: '#80ff00',    // Verde-amarillo - densidad moderada
  0.55: '#ffff00',   // Amarillo - densidad media
  0.7: '#ff8000',    // Naranja - alta densidad
  0.85: '#ff4000',   // Rojo-naranja - muy alta densidad
  1.0: '#ff0000'     // Rojo intenso - densidad crítica
};

export function createHeatLayer(points, map) {
  console.log(`🧠 Creando heatmap ALTA DENSIDAD con ${points.length} puntos (sistema multipunto)`);

  // Verificar si es sistema multipunto
  if (points.length > 50000) {
    console.log('🚀 Detectado sistema multipunto - aplicando optimizaciones para alta densidad');
  }

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

  console.log(`✅ ${validPoints.length} puntos válidos para heatmap ALTA DENSIDAD`);

  if (validPoints.length === 0) {
    console.error('❌ No hay puntos válidos para crear heatmap');
    return null;
  }

  // Estadísticas de densidad
  const densityStats = analyzeDensity(validPoints);
  console.log('📊 Densidad promedio:', densityStats.avgIntensity.toFixed(3));
  console.log('🎯 Rango intensidades:', `${densityStats.minIntensity} - ${densityStats.maxIntensity}`);

  // Configuración inicial adaptativa
  const zoom = map.getZoom();
  const config = getConfigForZoom(zoom, validPoints.length);

  // Crear heatmap layer optimizado
  const heatLayer = L.heatLayer(validPoints, {
    ...config,
    gradient: CATALUNYA_GRADIENT
  });

  // Event listener para zoom dinámico optimizado
  map.on('zoomend', () => {
    const newZoom = map.getZoom();
    const newConfig = getConfigForZoom(newZoom, validPoints.length);

    heatLayer.setOptions({
      ...newConfig,
      gradient: CATALUNYA_GRADIENT
    });

    console.log(`🔄 Heatmap ALTA DENSIDAD actualizado: zoom ${newZoom}, radius ${newConfig.radius}px`);
  });

  console.log(`🎯 Heatmap ALTA DENSIDAD creado: zoom ${zoom}, ${validPoints.length} puntos, radius ${config.radius}px`);
  return heatLayer;
}

// Configuración adaptativa basada en zoom y densidad de puntos
function getConfigForZoom(zoom, pointCount = 0) {
  let config;
  if (zoom <= 7) config = HEATMAP_CONFIGS.low;
  else if (zoom <= 10) config = HEATMAP_CONFIGS.medium;
  else config = HEATMAP_CONFIGS.high;

  // Ajustes adicionales para muy alta densidad (>50k puntos)
  if (pointCount > 50000) {
    config = {
      ...config,
      radius: Math.max(10, config.radius - 5), // Reducir radio adicional
      max: Math.min(0.9, config.max * 0.9)     // Reducir saturación máxima
    };
  }

  return config;
}

// Análisis de densidad para optimizaciones dinámicas
function analyzeDensity(points) {
  const intensities = points.map(p => p[2]);
  return {
    minIntensity: Math.min(...intensities),
    maxIntensity: Math.max(...intensities),
    avgIntensity: intensities.reduce((a,b) => a+b, 0) / intensities.length,
    pointCount: points.length
  };
}

// Debugging mejorado para sistema multipunto
export function debugHeatmap(heatLayer, points) {
  console.log('🔍 DEBUG HEATMAP ALTA DENSIDAD:');
  console.log(`- Puntos totales: ${points.length} ${points.length > 50000 ? '(ALTA DENSIDAD)' : ''}`);
  console.log(`- Layer válido: ${!!heatLayer}`);
  console.log(`- Configuración actual:`, heatLayer.options);

  // Análisis avanzado de densidad
  const densityStats = analyzeDensity(points);
  console.log('📊 ESTADÍSTICAS DENSIDAD:', {
    min: densityStats.minIntensity,
    max: densityStats.maxIntensity,
    promedio: densityStats.avgIntensity.toFixed(3),
    puntos: densityStats.pointCount,
    tipo: densityStats.pointCount > 50000 ? 'SISTEMA MULTIPUNTO' : 'SISTEMA ESTÁNDAR'
  });

  // Verificar forma Catalunya
  const bounds = {
    north: Math.max(...points.map(p => p[0])),
    south: Math.min(...points.map(p => p[0])),
    east: Math.max(...points.map(p => p[1])),
    west: Math.min(...points.map(p => p[1]))
  };

  console.log('🗺️ LÍMITES CATALUNYA:', bounds);
  const shapeOk = bounds.north < 42.9 && bounds.south > 40.5 &&
                  bounds.east < 3.4 && bounds.west > 0.1;
  console.log(`📏 Forma Catalunya: ${shapeOk ? '✅ PRESERVADA' : '❌ ALTERADA'}`);

  // Análisis de cobertura
  const coverage = (bounds.north - bounds.south) * (bounds.east - bounds.west);
  const density = points.length / coverage;
  console.log(`🎯 Cobertura: ${coverage.toFixed(3)}°², Densidad: ${density.toFixed(0)} puntos/°²`);
  console.log(`🚀 Optimización: ${density > 10000 ? '✅ ALTA DENSIDAD OPTIMA' : '⚠️ Densidad mejorable'}`);
}