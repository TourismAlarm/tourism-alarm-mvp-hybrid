// 🎯 HEATMAP TRANSPARENTE OPTIMIZADO - SISTEMA BAJA DENSIDAD CATALUNYA
import 'leaflet.heat';

// Configuración TRANSPARENTE para ver siempre el mapa base
const HEATMAP_CONFIGS = {
  low: {     // zoom 6-7 (vista Catalunya completa) - TRANSPARENTE
    radius: 50,      // Aumentar radius para mejor cobertura
    blur: 40,        // Más blur para suavizar
    minOpacity: 0.05,  // MUY TRANSPARENTE
    max: 0.3         // REDUCIR intensidad máxima para transparencia
  },
  medium: {  // zoom 8-10 (vista regional) - SEMI-TRANSPARENTE
    radius: 40,
    blur: 30,
    minOpacity: 0.05,
    max: 0.4         // Máximo 40% opacidad
  },
  high: {    // zoom 11+ (vista local) - MENOS TRANSPARENTE
    radius: 30,
    blur: 20,
    minOpacity: 0.05,
    max: 0.5         // Máximo 50% opacidad en zoom alto
  }
};

// GRADIENTE TRANSPARENTE - Siempre ver el mapa base
const CATALUNYA_GRADIENT = {
  0.0: 'transparent',
  0.1: 'rgba(0, 255, 128, 0.2)',     // Verde muy transparente
  0.3: 'rgba(128, 255, 0, 0.3)',     // Verde-amarillo transparente
  0.5: 'rgba(255, 255, 0, 0.4)',     // Amarillo semi-transparente
  0.7: 'rgba(255, 128, 0, 0.5)',     // Naranja semi-transparente
  0.9: 'rgba(255, 64, 0, 0.6)',      // Rojo-naranja translúcido
  1.0: 'rgba(255, 0, 0, 0.7)'        // Rojo máximo 70% opacidad
};

export function createHeatLayer(points, map) {
  console.log(`🌊 Creando heatmap TRANSPARENTE con ${points.length} puntos`);

  // Verificar densidad apropiada
  if (points.length > 5000) {
    console.warn('⚠️ DEMASIADOS PUNTOS - Heatmap puede ser opaco');
  } else {
    console.log('✅ Densidad óptima para transparencia');
  }

  const zoom = map.getZoom();

  // Ajustar intensidad de TODOS los puntos según zoom para transparencia
  const intensityMultiplier = zoom < 8 ? 0.5 : zoom < 10 ? 0.7 : 1.0;

  const adjustedPoints = points.map(([lat, lng, intensity]) => {
    return [lat, lng, intensity * intensityMultiplier];
  });

  // Validar puntos (mantener validación exacta)
  const validPoints = adjustedPoints.filter(point => {
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

  console.log(`✅ ${validPoints.length} puntos válidos para heatmap TRANSPARENTE`);

  if (validPoints.length === 0) {
    console.error('❌ No hay puntos válidos para crear heatmap');
    return null;
  }

  // Estadísticas de transparencia
  const densityStats = analyzeDensity(validPoints);
  console.log('📊 Intensidad promedio:', densityStats.avgIntensity.toFixed(3));
  console.log('🌊 Transparencia:', densityStats.avgIntensity < 0.3 ? '✅ BUENA' : '⚠️ REVISAR');

  // Configuración inicial transparente
  const config = getConfigForZoom(zoom);

  // Crear heatmap layer TRANSPARENTE
  const heatLayer = L.heatLayer(validPoints, {
    ...config,
    gradient: CATALUNYA_GRADIENT
  });

  // Event listener para zoom dinámico transparente
  map.on('zoomend', () => {
    const newZoom = map.getZoom();
    const newConfig = getConfigForZoom(newZoom);

    // Recalcular intensidades según zoom
    const newIntensityMultiplier = newZoom < 8 ? 0.5 : newZoom < 10 ? 0.7 : 1.0;
    const newAdjustedPoints = points.map(([lat, lng, intensity]) => {
      return [lat, lng, intensity * newIntensityMultiplier];
    });

    heatLayer.setLatLngs(newAdjustedPoints.filter(p =>
      p[0] >= 40.52 && p[0] <= 42.86 && p[1] >= 0.16 && p[1] <= 3.33
    ));

    heatLayer.setOptions({
      ...newConfig,
      gradient: CATALUNYA_GRADIENT
    });

    console.log(`🔄 Heatmap TRANSPARENTE actualizado: zoom ${newZoom}, max opacidad ${newConfig.max}`);
  });

  console.log(`🎯 Heatmap TRANSPARENTE creado: zoom ${zoom}, max opacidad ${config.max}`);
  return heatLayer;
}

// Configuración transparente basada en zoom
function getConfigForZoom(zoom) {
  if (zoom <= 7) return HEATMAP_CONFIGS.low;
  else if (zoom <= 10) return HEATMAP_CONFIGS.medium;
  else return HEATMAP_CONFIGS.high;
}

// Análisis de densidad para transparencia
function analyzeDensity(points) {
  const intensities = points.map(p => p[2]);
  return {
    minIntensity: Math.min(...intensities),
    maxIntensity: Math.max(...intensities),
    avgIntensity: intensities.reduce((a,b) => a+b, 0) / intensities.length,
    pointCount: points.length
  };
}

// Debugging para sistema transparente
export function debugHeatmap(heatLayer, points) {
  console.log('🔍 DEBUG HEATMAP TRANSPARENTE:');
  console.log(`- Puntos totales: ${points.length} ${points.length > 5000 ? '(DEMASIADOS)' : '(ÓPTIMO)'}`);
  console.log(`- Layer válido: ${!!heatLayer}`);
  console.log(`- Configuración actual:`, heatLayer.options);

  // Análisis de transparencia
  const densityStats = analyzeDensity(points);
  console.log('📊 ESTADÍSTICAS TRANSPARENCIA:', {
    min: densityStats.minIntensity,
    max: densityStats.maxIntensity,
    promedio: densityStats.avgIntensity.toFixed(3),
    puntos: densityStats.pointCount,
    transparencia: densityStats.avgIntensity < 0.3 ? 'BUENA ✅' : 'MEJORAR ⚠️'
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

  // Análisis de cobertura transparente
  const coverage = (bounds.north - bounds.south) * (bounds.east - bounds.west);
  const density = points.length / coverage;
  console.log(`🎯 Cobertura: ${coverage.toFixed(3)}°², Densidad: ${density.toFixed(0)} puntos/°²`);
  console.log(`🌊 Optimización transparencia: ${density < 1000 ? '✅ PERFECTA' : density < 2000 ? '✅ BUENA' : '⚠️ REDUCIR MÁS'}`);

  // Verificar que el mapa base será visible
  const maxOpacity = Math.max(...points.map(p => p[2]));
  console.log(`👁️ Visibilidad mapa base: ${maxOpacity < 0.8 ? '✅ VISIBLE' : '❌ OPACO'}`);
}