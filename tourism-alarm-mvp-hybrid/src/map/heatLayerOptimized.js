import 'leaflet.heat';

// 🏛️ CONFIGURACIÓN OPTIMIZADA PARA CATALUNYA
const CATALUNYA_BOUNDS = {
    north: 42.86, south: 40.52,
    east: 3.33, west: 0.16
};

const BARCELONA_BOUNDS = {
    north: 41.469, south: 41.320,
    east: 2.228, west: 2.052
};

// Configuración específica para territorio catalán (~32,000 km²)
const CATALUNYA_HEATMAP_CONFIG = {
    radius: 30,           // Optimizado para visibilidad regional
    blur: 20,             // Suavizado para cobertura territorial
    maxZoom: 12,          // Evita sobre-intensificación
    minOpacity: 0.4,      // Visibilidad garantizada
    max: 1.0,             // Usar rango completo tras normalización
    gradient: {
        0.0: 'transparent',
        0.2: '#0066CC',   // Azul para intensidad baja
        0.4: '#00CC66',   // Verde para media
        0.6: '#FFCC00',   // Amarillo para alta
        0.8: '#FF6600',   // Naranja para muy alta
        1.0: '#FF3300'    // Rojo para máxima
    }
};

// 📊 NORMALIZADOR DE DATOS TURÍSTICOS
export function normalizeTourismData(data) {
    console.log('🔧 Normalizando datos turísticos para Catalunya...');

    if (!data || data.length === 0) {
        console.warn('⚠️ No hay datos para normalizar');
        return [];
    }

    const intensities = data.map(point => point[2]);
    const minIntensity = Math.min(...intensities);
    const maxIntensity = Math.max(...intensities);

    console.log(`📊 Rango original: ${minIntensity.toFixed(3)} - ${maxIntensity.toFixed(3)}`);

    return data.map(point => {
        const [lat, lng, intensity] = point;

        // Normalización linear 0.09-0.41 → 0-1
        const normalized = (intensity - minIntensity) / (maxIntensity - minIntensity);

        // Gamma correction para mejor contraste visual
        const enhanced = Math.pow(normalized, 0.7);

        return [lat, lng, enhanced];
    });
}

// 🎯 BOOST METROPOLITANO BARCELONA
export function applyBarcelonaBoost(data) {
    console.log('🏙️ Aplicando boost metropolitano Barcelona...');

    return data.map(point => {
        const [lat, lng, intensity] = point;

        // Boost 30% intensidad en área metropolitana Barcelona
        if (lat >= BARCELONA_BOUNDS.south && lat <= BARCELONA_BOUNDS.north &&
            lng >= BARCELONA_BOUNDS.west && lng <= BARCELONA_BOUNDS.east) {
            const boosted = Math.min(intensity * 1.3, 1.0);
            console.log(`🎯 Barcelona boost: ${intensity.toFixed(2)} → ${boosted.toFixed(2)}`);
            return [lat, lng, boosted];
        }
        return point;
    });
}

// ✅ VALIDADOR DE COORDENADAS CATALUNYA
export function validateCatalunyaCoordinates(lat, lng) {
    return lat >= CATALUNYA_BOUNDS.south && lat <= CATALUNYA_BOUNDS.north &&
           lng >= CATALUNYA_BOUNDS.west && lng <= CATALUNYA_BOUNDS.east;
}

// 🔍 DETECTOR DE PROBLEMAS EN COORDENADAS
export function detectCoordinateIssues(data) {
    const issues = [];

    data.forEach((point, index) => {
        const [lat, lng] = point;

        if (!validateCatalunyaCoordinates(lat, lng)) {
            issues.push({
                index,
                coordinates: [lat, lng],
                type: 'OUT_OF_BOUNDS'
            });
        }
    });

    if (issues.length > 0) {
        console.warn(`⚠️ ${issues.length} coordenadas fuera de Catalunya:`, issues);
    }

    return issues;
}

// 🚀 CREADOR DE HEATMAP ADAPTATIVO
export function createAdaptiveHeatmap(rawData, map) {
    console.log('🗺️ Creando heatmap adaptativo para Catalunya...');

    // 1. Validar puntos básicos
    const validPoints = rawData.filter(point =>
        Array.isArray(point) &&
        point.length >= 3 &&
        typeof point[0] === 'number' &&
        typeof point[1] === 'number' &&
        typeof point[2] === 'number'
    );

    if (validPoints.length === 0) {
        console.warn('⚠️ No hay puntos válidos para el heatmap');
        return L.heatLayer([[41.5, 2.0, 0.1]], CATALUNYA_HEATMAP_CONFIG);
    }

    // 2. Detectar problemas de coordenadas
    detectCoordinateIssues(validPoints);

    // 3. Normalizar datos turísticos
    const normalizedData = normalizeTourismData(validPoints);

    // 4. Aplicar boost Barcelona
    const boostedData = applyBarcelonaBoost(normalizedData);

    // 5. Crear heatmap con configuración optimizada
    const heatLayer = L.heatLayer(boostedData, CATALUNYA_HEATMAP_CONFIG);

    // 6. Configurar ajuste dinámico por zoom
    if (map) {
        setupDynamicRadius(heatLayer, map);
    }

    console.log(`✅ Heatmap creado: ${boostedData.length} puntos procesados`);
    return heatLayer;
}

// 🔄 CONFIGURACIÓN DINÁMICA POR ZOOM
function setupDynamicRadius(heatLayer, map) {
    map.on('zoomend', function() {
        const zoom = map.getZoom();
        let radius, blur;

        if (zoom <= 6) {
            radius = 50; blur = 30;
        } else if (zoom <= 8) {
            radius = 35; blur = 25;
        } else if (zoom <= 10) {
            radius = 25; blur = 20;
        } else {
            radius = 20; blur = 15;
        }

        heatLayer.setOptions({
            radius: radius,
            blur: blur
        });

        console.log(`🔄 Zoom ${zoom}: radius=${radius}, blur=${blur}`);
    });
}

// 🛠️ HERRAMIENTAS DE DEBUGGING
export class HeatmapDebugger {
    constructor(heatmapLayer) {
        this.heatmap = heatmapLayer;
    }

    // Validar visibilidad del heatmap
    checkVisibility() {
        try {
            const canvas = this.heatmap.getCanvas();
            if (!canvas) return { error: 'No canvas found' };

            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            let visiblePixels = 0;
            for (let i = 3; i < imageData.data.length; i += 4) {
                if (imageData.data[i] > 0) visiblePixels++;
            }

            const totalPixels = imageData.data.length / 4;
            const visibilityRatio = visiblePixels / totalPixels;

            return {
                totalPixels,
                visiblePixels,
                visibilityRatio,
                status: visibilityRatio > 0.01 ? 'VISIBLE' : 'INVISIBLE'
            };
        } catch (error) {
            return { error: error.message };
        }
    }

    // Diagnóstico completo
    diagnose() {
        const visibility = this.checkVisibility();
        const config = this.heatmap.options;

        return {
            visibility,
            config: {
                radius: config.radius,
                blur: config.blur,
                maxZoom: config.maxZoom,
                minOpacity: config.minOpacity
            },
            recommendations: this.getRecommendations(visibility)
        };
    }

    getRecommendations(visibility) {
        const recs = [];

        if (visibility.error) {
            recs.push('❌ Error accediendo al canvas del heatmap');
        } else if (visibility.visibilityRatio < 0.01) {
            recs.push('🔧 Aumentar radius o minOpacity');
            recs.push('🔧 Verificar normalización de datos');
            recs.push('🔧 Comprobar maxZoom configuration');
        } else {
            recs.push('✅ Heatmap visible correctamente');
        }

        return recs;
    }
}

// Función de compatibilidad con versión anterior
export function createHeatLayer(points) {
    console.log('⚠️ Usando createHeatLayer legacy, considera usar createAdaptiveHeatmap');
    return createAdaptiveHeatmap(points);
}