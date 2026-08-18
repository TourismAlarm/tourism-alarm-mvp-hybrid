// 🗺️ Capa coroplética de los 947 municipios de Catalunya.
//
// Dos cosas que antes rompían el mapa y aquí están resueltas:
//
//  1. `L` se usaba como global sin importar Leaflet.
//  2. Los identificadores se comparaban tal cual. El TopoJSON guarda el código
//     IDESCAT como número (80193), así que los municipios de la provincia de
//     Barcelona pierden el cero inicial y no casaban con los "080193" de los
//     datos. Ahora ambos lados se normalizan antes de cruzarse.

import L from 'leaflet';
import * as topojson from 'topojson-client';

const GEOJSON_URL = '/geojson/cat-municipis.json';

// Escala secuencial verde -> rojo. Los niveles bajos son deliberadamente
// pálidos: la mayor parte de Catalunya tiene poca presión turística y si se
// pintan en verde saturado tapan visualmente las zonas que sí están al límite.
export const LEVELS = [
  { key: 'critica',  label: 'Crítica',  min: 0.8, color: '#c0272d' },
  { key: 'alta',     label: 'Alta',     min: 0.6, color: '#f2874a' },
  { key: 'media',    label: 'Media',    min: 0.4, color: '#f7d060' },
  { key: 'moderada', label: 'Moderada', min: 0.2, color: '#b9dc9a' },
  { key: 'baja',     label: 'Baja',     min: 0,   color: '#e6f0e2' }
];

const NO_DATA_COLOR = '#eceff3';

export function normalizeId(id) {
  return String(id).trim().replace(/^0+/, '');
}

export function levelFor(intensity) {
  return LEVELS.find(level => intensity > level.min) || LEVELS[LEVELS.length - 1];
}

export function colorFor(intensity, hasData = true) {
  if (!hasData) return NO_DATA_COLOR;
  return levelFor(intensity).color;
}

const integer = new Intl.NumberFormat('es-ES');
const decimal = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

function popupHtml(muni, intensity) {
  const level = levelFor(intensity);
  const where = [muni.comarca, muni.provincia].filter(Boolean).join(' · ');

  const capacity = muni.total_places > 0
    ? `
      <dl>
        <dt>Presión turística</dt><dd>${(intensity * 100).toFixed(0)}%</dd>
        <dt>Plazas turísticas</dt><dd>${integer.format(muni.total_places)}</dd>
        <dt>Plazas por km²</dt><dd>${decimal.format(muni.places_per_km2)}</dd>
        <dt>Superficie</dt><dd>${decimal.format(muni.area_km2)} km²</dd>
      </dl>
      <div class="level" style="background:${level.color}">${level.label}</div>`
    : '<p class="no-data">Sin plazas turísticas registradas en el IDESCAT.</p>';

  const breakdown = muni.total_places > 0
    ? `<p class="no-data">${integer.format(muni.hotel_places)} hoteleras ·
        ${integer.format(muni.camping_places)} camping ·
        ${integer.format(muni.rural_places)} rural</p>`
    : '';

  return `
    <div class="muni-popup">
      <h4>${muni.name}</h4>
      <div class="muni-where">${where}${muni.brand ? ` · ${muni.brand}` : ''}</div>
      ${capacity}
      ${breakdown}
    </div>`;
}

/**
 * Crea la capa coroplética. Devuelve un objeto con la capa de Leaflet y las
 * utilidades para repintarla al cambiar de mes o para hacer zoom sobre un
 * municipio concreto, sin tener que reconstruir la geometría.
 */
export async function createMunicipalityLayer(municipalities) {
  const response = await fetch(GEOJSON_URL);
  if (!response.ok) {
    throw new Error(`No se pudo cargar la geometría (HTTP ${response.status})`);
  }

  const topoData = await response.json();
  const objectName = Object.keys(topoData.objects || {})[0];
  if (!objectName) {
    throw new Error('El TopoJSON no contiene ninguna capa');
  }

  const geojson = topojson.feature(topoData, topoData.objects[objectName]);

  // Índice por código normalizado: evita el .find() por polígono (947²).
  const byId = new Map(municipalities.map(m => [normalizeId(m.id), m]));

  let currentMonth = new Date().getMonth() + 1;
  let matched = 0;

  const intensityOf = muni => {
    if (!muni) return 0;
    const monthly = muni.monthly_intensity || {};
    return monthly[currentMonth] ?? monthly[String(currentMonth)] ?? muni.tourism_intensity ?? 0;
  };

  const styleFor = feature => {
    const muni = byId.get(normalizeId(feature.id));
    return {
      fillColor: colorFor(intensityOf(muni), Boolean(muni)),
      fillOpacity: 0.85,
      weight: 0.5,
      color: '#94a3b8',
      opacity: 0.55
    };
  };

  const layer = L.geoJson(geojson, {
    style: styleFor,
    onEachFeature(feature, featureLayer) {
      const muni = byId.get(normalizeId(feature.id));
      if (muni) {
        matched++;
        featureLayer.municipalityId = normalizeId(muni.id);
      }

      const name = muni?.name || feature.properties?.nom || 'Municipio';

      featureLayer.bindTooltip(name, {
        className: 'muni-tooltip',
        sticky: true,
        direction: 'top'
      });

      featureLayer.bindPopup(() =>
        muni
          ? popupHtml(muni, intensityOf(muni))
          : `<div class="muni-popup"><h4>${name}</h4>
             <p class="no-data">Sin datos para este municipio.</p></div>`
      );

      featureLayer.on('mouseover', () => {
        featureLayer.setStyle({ weight: 2.2, color: '#0f172a', fillOpacity: 0.9 });
        featureLayer.bringToFront();
      });

      featureLayer.on('mouseout', () => {
        layer.resetStyle(featureLayer);
      });
    }
  });

  console.log(`🔗 Polígonos cruzados con datos: ${matched}/${geojson.features.length}`);

  if (matched === 0) {
    throw new Error('Ningún municipio del mapa casa con los datos cargados');
  }

  return {
    layer,
    matched,
    total: geojson.features.length,

    /** Repinta la coropleta para otro mes sin rehacer la geometría. */
    setMonth(month) {
      currentMonth = month;
      layer.setStyle(styleFor);
      layer.eachLayer(featureLayer => {
        if (featureLayer.isPopupOpen()) featureLayer.openPopup();
      });
    },

    /** Centra el mapa en un municipio y abre su ficha. */
    focus(map, municipalityId) {
      const id = normalizeId(municipalityId);
      layer.eachLayer(featureLayer => {
        if (featureLayer.municipalityId !== id) return;
        map.fitBounds(featureLayer.getBounds(), { maxZoom: 11, padding: [40, 40] });
        featureLayer.openPopup();
      });
    }
  };
}
