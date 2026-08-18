// 🗺️ Capa coroplética de los 947 municipios de Catalunya.
//
// Dos cosas que rompían el mapa y aquí están resueltas:
//
//  1. `L` se usaba como global sin importar Leaflet.
//  2. Los identificadores se comparaban tal cual. El TopoJSON guarda el código
//     IDESCAT como número, así que los municipios de la provincia de Barcelona
//     pierden el cero inicial y no casaban con los "080193" de los datos.
//     Ahora ambos lados se normalizan antes de cruzarse.
//
// La capa no calcula intensidades: las recibe ya hechas y solo se encarga de
// pintarlas, para que cambiar de día no obligue a rehacer la geometría.

import L from 'leaflet';
import * as topojson from 'topojson-client';
import { LEVELS, levelFor } from '../lib/pressure.js';

const GEOJSON_URL = '/geojson/cat-municipis.json';
const NO_DATA_COLOR = '#eceff3';

export { LEVELS, levelFor };

export function normalizeId(id) {
  return String(id).trim().replace(/^0+/, '');
}

export function colorFor(intensity, hasData = true) {
  return hasData ? levelFor(intensity).color : NO_DATA_COLOR;
}

/**
 * Crea la capa coroplética.
 *
 * @param municipalities lista de municipios con id, name…
 * @param renderPopup    función que devuelve el HTML de la ficha
 */
export async function createMunicipalityLayer(municipalities, renderPopup) {
  const response = await fetch(GEOJSON_URL);
  if (!response.ok) {
    throw new Error(`No se pudo cargar la geometría (HTTP ${response.status})`);
  }

  const topoData = await response.json();
  const objectName = Object.keys(topoData.objects || {})[0];
  if (!objectName) throw new Error('El TopoJSON no contiene ninguna capa');

  const geojson = topojson.feature(topoData, topoData.objects[objectName]);

  // Índice por código normalizado: evita el .find() por polígono (947²).
  const byId = new Map(municipalities.map(m => [normalizeId(m.id), m]));

  let intensities = new Map();
  let matched = 0;

  const intensityOf = municipality =>
    municipality ? intensities.get(municipality.id) ?? 0 : 0;

  const styleFor = feature => {
    const municipality = byId.get(normalizeId(feature.id));
    return {
      fillColor: colorFor(intensityOf(municipality), Boolean(municipality)),
      fillOpacity: 0.85,
      weight: 0.5,
      color: '#94a3b8',
      opacity: 0.55
    };
  };

  const layer = L.geoJson(geojson, {
    style: styleFor,
    onEachFeature(feature, featureLayer) {
      const municipality = byId.get(normalizeId(feature.id));
      if (municipality) {
        matched++;
        featureLayer.municipalityId = normalizeId(municipality.id);
      }

      const name = municipality?.name || feature.properties?.nom || 'Municipio';

      featureLayer.bindTooltip(name, {
        className: 'muni-tooltip',
        sticky: true,
        direction: 'top'
      });

      featureLayer.bindPopup(() =>
        municipality
          ? renderPopup(municipality)
          : `<div class="muni-popup"><h4>${name}</h4>
             <p class="no-data">Sin datos para este municipio.</p></div>`
      );

      featureLayer.on('mouseover', () => {
        featureLayer.setStyle({ weight: 2.2, color: '#0f172a', fillOpacity: 0.94 });
        featureLayer.bringToFront();
      });

      featureLayer.on('mouseout', () => layer.resetStyle(featureLayer));
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

    /** Repinta la coropleta con un nuevo mapa de intensidades por id. */
    setIntensities(next) {
      intensities = next;
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
