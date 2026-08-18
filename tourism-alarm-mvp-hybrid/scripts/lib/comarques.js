// 📍 Comarques de Catalunya y marcas turísticas oficiales (IDESCAT)
//
// Los códigos son los oficiales del IDESCAT (1-42) y coinciden con el campo
// `comarca` del TopoJSON en public/geojson/cat-municipis.json.
//
// Las "marques turístiques" son las mismas 9 que usa el IDESCAT en sus
// estadísticas mensuales de ocupación hotelera (turhot), por lo que podemos
// cruzar directamente la estacionalidad real con cada municipio.

export const COMARQUES = {
  1:  { name: 'Alt Camp',            brand: 'Costa Daurada' },
  2:  { name: 'Alt Empordà',         brand: 'Costa Brava' },
  3:  { name: 'Alt Penedès',         brand: 'Costa Barcelona' },
  4:  { name: "Alt Urgell",          brand: 'Pirineus' },
  5:  { name: 'Alta Ribagorça',      brand: 'Pirineus' },
  6:  { name: 'Anoia',               brand: 'Paisatges Barcelona' },
  7:  { name: 'Bages',               brand: 'Paisatges Barcelona' },
  8:  { name: 'Baix Camp',           brand: 'Costa Daurada' },
  9:  { name: 'Baix Ebre',           brand: "Terres de l'Ebre" },
  10: { name: 'Baix Empordà',        brand: 'Costa Brava' },
  11: { name: 'Baix Llobregat',      brand: 'Costa Barcelona' },
  12: { name: 'Baix Penedès',        brand: 'Costa Daurada' },
  13: { name: 'Barcelonès',          brand: 'Costa Barcelona' }, // Barcelona ciudad se separa aparte
  14: { name: 'Berguedà',            brand: 'Pirineus' },
  15: { name: 'Cerdanya',            brand: 'Pirineus' },
  16: { name: 'Conca de Barberà',    brand: 'Costa Daurada' },
  17: { name: 'Garraf',              brand: 'Costa Barcelona' },
  18: { name: 'Garrigues',           brand: 'Terres de Lleida' },
  19: { name: 'Garrotxa',            brand: 'Pirineus' },
  20: { name: 'Gironès',             brand: 'Costa Brava' },
  21: { name: 'Maresme',             brand: 'Costa Barcelona' },
  22: { name: 'Montsià',             brand: "Terres de l'Ebre" },
  23: { name: 'Noguera',             brand: 'Terres de Lleida' },
  24: { name: 'Osona',               brand: 'Paisatges Barcelona' },
  25: { name: 'Pallars Jussà',       brand: 'Pirineus' },
  26: { name: 'Pallars Sobirà',      brand: 'Pirineus' },
  27: { name: "Pla d'Urgell",        brand: 'Terres de Lleida' },
  28: { name: "Pla de l'Estany",     brand: 'Costa Brava' },
  29: { name: 'Priorat',             brand: 'Costa Daurada' },
  30: { name: "Ribera d'Ebre",       brand: "Terres de l'Ebre" },
  31: { name: 'Ripollès',            brand: 'Pirineus' },
  32: { name: 'Segarra',             brand: 'Terres de Lleida' },
  33: { name: 'Segrià',              brand: 'Terres de Lleida' },
  34: { name: 'Selva',               brand: 'Costa Brava' },
  35: { name: 'Solsonès',            brand: 'Pirineus' },
  36: { name: 'Tarragonès',          brand: 'Costa Daurada' },
  37: { name: 'Terra Alta',          brand: "Terres de l'Ebre" },
  38: { name: 'Urgell',              brand: 'Terres de Lleida' },
  39: { name: "Val d'Aran",          brand: "Val d'Aran" },
  40: { name: 'Vallès Occidental',   brand: 'Costa Barcelona' },
  41: { name: 'Vallès Oriental',     brand: 'Costa Barcelona' },
  42: { name: 'Moianès',             brand: 'Paisatges Barcelona' }
};

export const PROVINCIES = {
  8:  'Barcelona',
  17: 'Girona',
  25: 'Lleida',
  43: 'Tarragona'
};

// Código IDESCAT del municipio de Barcelona: marca turística propia.
export const BARCELONA_CITY_ID = '80193';

export function getComarca(code) {
  return COMARQUES[Number(code)] || { name: 'Desconeguda', brand: 'Paisatges Barcelona' };
}

// Marca turística de un municipio (Barcelona ciudad es marca propia en IDESCAT)
export function getBrand(municipalityId, comarcaCode) {
  if (normalizeId(municipalityId) === BARCELONA_CITY_ID) return 'Barcelona';
  return getComarca(comarcaCode).brand;
}

// Los códigos INE/IDESCAT aparecen con y sin cero inicial según la fuente
// ("080193" en los CSV, 80193 en el TopoJSON). Normalizamos siempre sin ceros
// a la izquierda para poder cruzarlos.
export function normalizeId(id) {
  return String(id).trim().replace(/^0+/, '');
}
