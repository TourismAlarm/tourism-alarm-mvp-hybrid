// 🏛️ INTEGRACIÓN CON API IDESCAT
// Institut d'Estadística de Catalunya - Datos oficiales
// Documentación: https://api.idescat.cat/

import axios from 'axios';

const IDESCAT_BASE_URL = 'https://api.idescat.cat';

/**
 * Cliente para la API de IDESCAT
 * Proporciona acceso a datos oficiales de municipios de Catalunya
 */
export class IdescatAPI {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 horas
  }

  /**
   * Obtener datos de población de un municipio
   * @param {string} codiMuni - Código INE del municipio (6 dígitos)
   * @returns {Promise<Object>} Datos de población
   */
  async getPopulation(codiMuni) {
    const cacheKey = `pop_${codiMuni}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // API de Empadronamiento (padró municipal)
      const response = await axios.get(
        `${IDESCAT_BASE_URL}/emex/v1/dades.json`,
        {
          params: {
            id: codiMuni,
            i: 'f171', // Indicador: Población total
            lang: 'ca'
          },
          timeout: 10000
        }
      );

      const data = this.parsePopulationResponse(response.data);
      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Error fetching population for ${codiMuni}:`, error.message);
      return null;
    }
  }

  /**
   * Obtener datos de establecimientos turísticos
   * @param {string} codiMuni - Código INE del municipio
   * @returns {Promise<Object>} Datos de establecimientos
   */
  async getTourismEstablishments(codiMuni) {
    const cacheKey = `tourism_${codiMuni}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // Indicadores de turismo
      const indicators = [
        'f301', // Hoteles
        'f302', // Plazas hoteleras
        'f303', // Campings
        'f304', // Plazas camping
        'f305', // Turismo rural
        'f306', // Apartamentos turísticos
      ];

      const response = await axios.get(
        `${IDESCAT_BASE_URL}/emex/v1/dades.json`,
        {
          params: {
            id: codiMuni,
            i: indicators.join(','),
            lang: 'ca'
          },
          timeout: 10000
        }
      );

      const data = this.parseTourismResponse(response.data);
      this.cache.set(cacheKey, data);
      return data;
    } catch (error) {
      console.error(`Error fetching tourism data for ${codiMuni}:`, error.message);
      return null;
    }
  }

  /**
   * Obtener todos los datos relevantes de un municipio
   * @param {string} codiMuni - Código INE del municipio
   * @returns {Promise<Object>} Datos completos
   */
  async getMunicipalityData(codiMuni) {
    try {
      const [population, tourism] = await Promise.all([
        this.getPopulation(codiMuni),
        this.getTourismEstablishments(codiMuni)
      ]);

      return {
        code: codiMuni,
        population: population?.total || 0,
        populationYear: population?.year || null,
        hotels: tourism?.hotels || 0,
        hotelPlaces: tourism?.hotelPlaces || 0,
        campings: tourism?.campings || 0,
        campingPlaces: tourism?.campingPlaces || 0,
        ruralTourism: tourism?.ruralTourism || 0,
        apartments: tourism?.apartments || 0,
        totalPlaces: (tourism?.hotelPlaces || 0) + (tourism?.campingPlaces || 0),
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Error fetching municipality data for ${codiMuni}:`, error.message);
      return null;
    }
  }

  /**
   * Obtener lista de todos los municipios de Catalunya
   * @returns {Promise<Array>} Lista de municipios con código y nombre
   */
  async getAllMunicipalities() {
    try {
      const response = await axios.get(
        `${IDESCAT_BASE_URL}/emex/v1/nodes.json`,
        {
          params: {
            tipus: 'mun',
            lang: 'ca'
          },
          timeout: 30000
        }
      );

      return this.parseMunicipalitiesList(response.data);
    } catch (error) {
      console.error('Error fetching municipalities list:', error.message);
      return [];
    }
  }

  /**
   * Buscar municipio por nombre
   * @param {string} name - Nombre del municipio
   * @returns {Promise<Array>} Municipios que coinciden
   */
  async searchMunicipality(name) {
    const all = await this.getAllMunicipalities();
    const searchTerm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    return all.filter(m => {
      const muniName = m.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return muniName.includes(searchTerm);
    });
  }

  // ============================================
  // PARSERS
  // ============================================

  parsePopulationResponse(data) {
    try {
      // La estructura de IDESCAT varía, este es un parser genérico
      if (data?.fitxes?.indicadors?.i) {
        const indicators = Array.isArray(data.fitxes.indicadors.i)
          ? data.fitxes.indicadors.i
          : [data.fitxes.indicadors.i];

        for (const ind of indicators) {
          if (ind.id === 'f171') {
            return {
              total: parseInt(ind.v) || 0,
              year: ind.any || new Date().getFullYear()
            };
          }
        }
      }
      return null;
    } catch (error) {
      console.error('Error parsing population response:', error);
      return null;
    }
  }

  parseTourismResponse(data) {
    try {
      const result = {
        hotels: 0,
        hotelPlaces: 0,
        campings: 0,
        campingPlaces: 0,
        ruralTourism: 0,
        apartments: 0
      };

      if (data?.fitxes?.indicadors?.i) {
        const indicators = Array.isArray(data.fitxes.indicadors.i)
          ? data.fitxes.indicadors.i
          : [data.fitxes.indicadors.i];

        for (const ind of indicators) {
          const value = parseInt(ind.v) || 0;
          switch (ind.id) {
            case 'f301': result.hotels = value; break;
            case 'f302': result.hotelPlaces = value; break;
            case 'f303': result.campings = value; break;
            case 'f304': result.campingPlaces = value; break;
            case 'f305': result.ruralTourism = value; break;
            case 'f306': result.apartments = value; break;
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Error parsing tourism response:', error);
      return null;
    }
  }

  parseMunicipalitiesList(data) {
    try {
      const municipalities = [];

      if (data?.nodes?.node) {
        const nodes = Array.isArray(data.nodes.node)
          ? data.nodes.node
          : [data.nodes.node];

        for (const node of nodes) {
          municipalities.push({
            code: node.id,
            name: node.content,
            comarca: node.pare?.content || null
          });
        }
      }

      return municipalities;
    } catch (error) {
      console.error('Error parsing municipalities list:', error);
      return [];
    }
  }

  /**
   * Limpiar caché
   */
  clearCache() {
    this.cache.clear();
  }
}

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

/**
 * Calcular intensidad turística desde datos de IDESCAT
 * @param {Object} data - Datos del municipio
 * @returns {number} Intensidad entre 0 y 1
 */
export function calculateIntensityFromIdescat(data) {
  if (!data || !data.population || data.population === 0) {
    return 0.15; // Default bajo
  }

  const totalPlaces = data.hotelPlaces + data.campingPlaces + (data.apartments * 4);
  const placesPer1000 = (totalPlaces / data.population) * 1000;

  // Escala basada en datos reales de Catalunya
  if (placesPer1000 > 1000) return 0.95;
  if (placesPer1000 > 500) return 0.85;
  if (placesPer1000 > 300) return 0.75;
  if (placesPer1000 > 150) return 0.65;
  if (placesPer1000 > 80) return 0.55;
  if (placesPer1000 > 50) return 0.45;
  if (placesPer1000 > 25) return 0.35;
  if (placesPer1000 > 15) return 0.25;
  return 0.15;
}

/**
 * Formatear datos de IDESCAT al formato de real-tourism-data.js
 * @param {Object} data - Datos de IDESCAT
 * @param {string} category - Categoría del municipio
 * @returns {Object} Datos en formato del proyecto
 */
export function formatForProject(data, category = 'interior') {
  return {
    name: data.name || `Municipio ${data.code}`,
    population: data.population || 0,
    hotel_places: data.hotelPlaces + Math.floor(data.campingPlaces * 0.5), // Ponderado
    tourism_intensity: calculateIntensityFromIdescat(data),
    categoria: category,
    source: 'idescat',
    fetchedAt: data.fetchedAt
  };
}

// ============================================
// BATCH PROCESSING
// ============================================

/**
 * Procesar múltiples municipios en lote
 * @param {Array<string>} codes - Lista de códigos INE
 * @param {number} delayMs - Delay entre peticiones (para no saturar API)
 * @param {Function} onProgress - Callback de progreso
 * @returns {Promise<Map>} Mapa de código -> datos
 */
export async function batchFetchMunicipalities(codes, delayMs = 500, onProgress = null) {
  const api = new IdescatAPI();
  const results = new Map();
  let processed = 0;

  for (const code of codes) {
    try {
      const data = await api.getMunicipalityData(code);
      if (data) {
        results.set(code, data);
      }
      processed++;

      if (onProgress) {
        onProgress({
          processed,
          total: codes.length,
          current: code,
          success: !!data
        });
      }

      // Delay para no saturar la API
      if (delayMs > 0 && processed < codes.length) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`Error processing ${code}:`, error.message);
      processed++;
    }
  }

  return results;
}

// Exportar instancia singleton
export const idescatAPI = new IdescatAPI();
export default IdescatAPI;
