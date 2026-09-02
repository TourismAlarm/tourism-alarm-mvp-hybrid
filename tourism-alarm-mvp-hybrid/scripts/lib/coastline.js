// 🏖️ Detección de municipios costeros a partir de la propia geometría.
//
// No hay ningún campo "es costero" en el TopoJSON, así que se deduce en dos
// pasos:
//
//  1. Un arco que solo pertenece a UN municipio es frontera exterior de
//     Catalunya (costa, Francia, Aragón o el País Valencià). Los arcos
//     compartidos por dos municipios son fronteras interiores.
//  2. De esas fronteras exteriores, la costa es la envolvente oriental del
//     territorio: por cada banda de latitud, el punto de tierra más al este.
//     La frontera francesa se descarta porque queda al norte de Portbou, el
//     punto costero más septentrional (42,44 N).
//
// Un municipio es costero si alguno de sus puntos de frontera exterior está a
// menos de COAST_MAX_KM de esa línea de costa.

const BAND = 0.02;              // ~2,2 km: la costa es continua, así que
                                // toda banda tiene puntos de litoral reales
const NORTHERNMOST_COAST = 42.45; // Portbou está a 42,43 N; al norte es Francia
const COAST_MAX_KM = 2.5;

const KM_PER_DEG_LAT = 111.32;
const kmPerDegLng = lat => 111.32 * Math.cos((lat * Math.PI) / 180);

// Proyección local a kilómetros: a esta escala el error es despreciable y
// permite medir distancias punto-a-segmento con geometría plana.
function toKm(point, originLat) {
  return [point[0] * kmPerDegLng(originLat), point[1] * KM_PER_DEG_LAT];
}

// Distancia de un punto al segmento ab. Medir contra los segmentos y no
// contra los vértices es lo que hace que Cambrils cuente como costero: su
// litoral queda retranqueado respecto al saliente de Salou, así que el vértice
// más cercano está a 7 km pero el segmento pasa a menos de 1 km.
function distanceToSegmentKm(point, a, b) {
  const originLat = point[1];
  const [px, py] = toKm(point, originLat);
  const [ax, ay] = toKm(a, originLat);
  const [bx, by] = toKm(b, originLat);

  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;

  let t = lengthSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));

  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Los arcos de un TopoJSON pueden venir anidados y con índices negativos
// (~i indica el arco i recorrido al revés).
function arcIndexes(geometry) {
  const out = [];
  const walk = node => {
    if (Array.isArray(node)) node.forEach(walk);
    else out.push(node < 0 ? ~node : node);
  };
  walk(geometry.arcs);
  return out;
}

function makeDecoder(topology) {
  if (!topology.transform) {
    return index => topology.arcs[index];
  }
  const { scale: [sx, sy], translate: [tx, ty] } = topology.transform;
  return index => {
    let x = 0;
    let y = 0;
    return topology.arcs[index].map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * sx + tx, y * sy + ty];
    });
  };
}

/**
 * Devuelve { coastal: Set<idTopoJSON>, coastline: [[lng,lat], …] }.
 */
export function detectCoastalMunicipalities(topology, objectName) {
  const geometries = topology.objects[objectName].geometries;
  const decode = makeDecoder(topology);

  // 1. Arcos usados una sola vez -> frontera exterior del territorio.
  const usage = new Map();
  for (const geometry of geometries) {
    for (const arc of new Set(arcIndexes(geometry))) {
      usage.set(arc, (usage.get(arc) || 0) + 1);
    }
  }
  const externalArcs = new Set([...usage].filter(([, n]) => n === 1).map(([arc]) => arc));

  // 2. Envolvente oriental: punto más al este por banda de latitud.
  const easternmost = new Map();
  for (let i = 0; i < topology.arcs.length; i++) {
    for (const [lng, lat] of decode(i)) {
      if (lat >= NORTHERNMOST_COAST) continue;
      const band = Math.round(lat / BAND);
      const current = easternmost.get(band);
      if (!current || lng > current[0]) easternmost.set(band, [lng, lat]);
    }
  }

  const coastline = [...easternmost.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point);

  // Índice por banda: solo se comparan los segmentos de latitud cercana.
  const nearbyBands = 3;
  const segmentsByBand = new Map();
  for (let i = 0; i < coastline.length - 1; i++) {
    const segment = [coastline[i], coastline[i + 1]];
    const from = Math.round(Math.min(segment[0][1], segment[1][1]) / BAND);
    const to = Math.round(Math.max(segment[0][1], segment[1][1]) / BAND);
    for (let band = from; band <= to; band++) {
      if (!segmentsByBand.has(band)) segmentsByBand.set(band, []);
      segmentsByBand.get(band).push(segment);
    }
  }

  const distanceToCoast = point => {
    const band = Math.round(point[1] / BAND);
    let best = Infinity;
    for (let b = band - nearbyBands; b <= band + nearbyBands; b++) {
      for (const [a, c] of segmentsByBand.get(b) || []) {
        best = Math.min(best, distanceToSegmentKm(point, a, c));
      }
    }
    return best;
  };

  const coastal = new Set();
  for (const geometry of geometries) {
    const id = String(geometry.id);
    for (const arc of new Set(arcIndexes(geometry))) {
      if (!externalArcs.has(arc)) continue;
      const hit = decode(arc).some(
        point => point[1] < NORTHERNMOST_COAST && distanceToCoast(point) <= COAST_MAX_KM
      );
      if (hit) {
        coastal.add(id);
        break;
      }
    }
  }

  return { coastal, coastline };
}
