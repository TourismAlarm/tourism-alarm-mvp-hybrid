// 🔍 SISTEMA DE VALIDACIÓN DE DATOS
// Valida datos de municipios antes de guardarlos
// Detecta anomalías, valores imposibles y datos sospechosos

/**
 * Rangos válidos basados en datos reales de Catalunya
 */
const VALID_RANGES = {
  population: {
    min: 0,
    max: 2000000, // Barcelona tiene ~1.6M
    warningMin: 10,
    warningMax: 500000
  },
  hotel_places: {
    min: 0,
    max: 100000, // Barcelona tiene ~75K
    warningMax: 50000
  },
  tourism_intensity: {
    min: 0,
    max: 1,
    warningMin: 0.05,
    warningMax: 0.98
  },
  placesPerCapita: {
    min: 0,
    max: 20, // Lloret tiene ~0.76 (30K plazas / 39K hab)
    warningMax: 2
  }
};

/**
 * Categorías válidas
 */
const VALID_CATEGORIES = ['costa', 'montaña', 'ciudad', 'interior'];

/**
 * Municipios de referencia para comparación
 */
const REFERENCE_DATA = {
  'Barcelona': { population: 1686208, hotel_places: 75000, intensity: 0.82 },
  'Lloret de Mar': { population: 39363, hotel_places: 30000, intensity: 0.95 },
  'Salou': { population: 26645, hotel_places: 35000, intensity: 0.92 },
  'Vielha e Mijaran': { population: 5474, hotel_places: 4500, intensity: 0.70 },
  'Girona': { population: 103369, hotel_places: 5500, intensity: 0.48 }
};

/**
 * Resultado de validación
 */
class ValidationResult {
  constructor() {
    this.isValid = true;
    this.errors = [];
    this.warnings = [];
    this.suggestions = [];
  }

  addError(message) {
    this.isValid = false;
    this.errors.push(message);
  }

  addWarning(message) {
    this.warnings.push(message);
  }

  addSuggestion(message) {
    this.suggestions.push(message);
  }

  toJSON() {
    return {
      isValid: this.isValid,
      errors: this.errors,
      warnings: this.warnings,
      suggestions: this.suggestions
    };
  }
}

/**
 * Validador principal de datos de municipios
 */
export class DataValidator {
  /**
   * Validar datos de un municipio
   * @param {Object} data - Datos del municipio
   * @returns {ValidationResult} Resultado de validación
   */
  validate(data) {
    const result = new ValidationResult();

    // Validaciones básicas de estructura
    this.validateStructure(data, result);
    if (!result.isValid) return result;

    // Validaciones de rangos
    this.validateRanges(data, result);

    // Validaciones de coherencia
    this.validateCoherence(data, result);

    // Validaciones de categoría
    this.validateCategory(data, result);

    // Comparación con referencias
    this.validateAgainstReferences(data, result);

    return result;
  }

  /**
   * Validar estructura básica
   */
  validateStructure(data, result) {
    const required = ['name', 'population', 'hotel_places', 'tourism_intensity', 'categoria'];

    for (const field of required) {
      if (data[field] === undefined || data[field] === null) {
        result.addError(`Campo requerido faltante: ${field}`);
      }
    }

    if (typeof data.name !== 'string' || data.name.trim() === '') {
      result.addError('El nombre debe ser una cadena no vacía');
    }

    if (typeof data.population !== 'number' || isNaN(data.population)) {
      result.addError('La población debe ser un número válido');
    }

    if (typeof data.hotel_places !== 'number' || isNaN(data.hotel_places)) {
      result.addError('Las plazas hoteleras deben ser un número válido');
    }

    if (typeof data.tourism_intensity !== 'number' || isNaN(data.tourism_intensity)) {
      result.addError('La intensidad turística debe ser un número válido');
    }
  }

  /**
   * Validar rangos de valores
   */
  validateRanges(data, result) {
    // Población
    if (data.population < VALID_RANGES.population.min) {
      result.addError(`Población negativa: ${data.population}`);
    }
    if (data.population > VALID_RANGES.population.max) {
      result.addError(`Población demasiado alta: ${data.population} (máx: ${VALID_RANGES.population.max})`);
    }
    if (data.population > 0 && data.population < VALID_RANGES.population.warningMin) {
      result.addWarning(`Población muy baja: ${data.population} - verificar si es correcto`);
    }

    // Plazas hoteleras
    if (data.hotel_places < VALID_RANGES.hotel_places.min) {
      result.addError(`Plazas hoteleras negativas: ${data.hotel_places}`);
    }
    if (data.hotel_places > VALID_RANGES.hotel_places.max) {
      result.addError(`Plazas hoteleras demasiado altas: ${data.hotel_places}`);
    }
    if (data.hotel_places > VALID_RANGES.hotel_places.warningMax) {
      result.addWarning(`Plazas hoteleras inusualmente altas: ${data.hotel_places}`);
    }

    // Intensidad turística
    if (data.tourism_intensity < VALID_RANGES.tourism_intensity.min ||
        data.tourism_intensity > VALID_RANGES.tourism_intensity.max) {
      result.addError(`Intensidad turística fuera de rango [0,1]: ${data.tourism_intensity}`);
    }
    if (data.tourism_intensity < VALID_RANGES.tourism_intensity.warningMin) {
      result.addWarning(`Intensidad muy baja: ${data.tourism_intensity} - verificar`);
    }
    if (data.tourism_intensity > VALID_RANGES.tourism_intensity.warningMax) {
      result.addWarning(`Intensidad muy alta: ${data.tourism_intensity} - verificar`);
    }
  }

  /**
   * Validar coherencia entre campos
   */
  validateCoherence(data, result) {
    // Ratio plazas/población
    if (data.population > 0) {
      const placesPerCapita = data.hotel_places / data.population;

      if (placesPerCapita > VALID_RANGES.placesPerCapita.max) {
        result.addError(
          `Ratio plazas/población imposible: ${placesPerCapita.toFixed(2)} ` +
          `(${data.hotel_places} plazas / ${data.population} hab)`
        );
      }

      if (placesPerCapita > VALID_RANGES.placesPerCapita.warningMax) {
        result.addWarning(
          `Ratio plazas/población muy alto: ${placesPerCapita.toFixed(2)} - ` +
          `típico de destino turístico masivo, verificar`
        );
      }

      // Coherencia intensidad vs ratio
      const expectedIntensity = this.estimateIntensity(placesPerCapita);
      const diff = Math.abs(data.tourism_intensity - expectedIntensity);

      if (diff > 0.3) {
        result.addWarning(
          `Intensidad (${data.tourism_intensity.toFixed(2)}) no coherente con ` +
          `ratio plazas/población. Esperado: ~${expectedIntensity.toFixed(2)}`
        );
        result.addSuggestion(`Intensidad sugerida: ${expectedIntensity.toFixed(2)}`);
      }
    }

    // Municipio sin plazas pero con alta intensidad
    if (data.hotel_places === 0 && data.tourism_intensity > 0.3) {
      result.addWarning(
        `Intensidad alta (${data.tourism_intensity}) pero sin plazas hoteleras`
      );
    }

    // Municipio grande sin datos turísticos
    if (data.population > 50000 && data.hotel_places < 100) {
      result.addWarning(
        `Municipio grande (${data.population} hab) con pocas plazas (${data.hotel_places}) - ` +
        `verificar datos`
      );
    }
  }

  /**
   * Validar categoría
   */
  validateCategory(data, result) {
    if (!VALID_CATEGORIES.includes(data.categoria)) {
      result.addError(
        `Categoría inválida: ${data.categoria}. ` +
        `Válidas: ${VALID_CATEGORIES.join(', ')}`
      );
    }

    // Coherencia categoría con intensidad
    if (data.categoria === 'costa' && data.tourism_intensity < 0.2) {
      result.addWarning(
        `Municipio costero con intensidad muy baja (${data.tourism_intensity}) - ` +
        `verificar categoría o datos`
      );
    }

    if (data.categoria === 'interior' && data.tourism_intensity > 0.7) {
      result.addWarning(
        `Municipio interior con intensidad muy alta (${data.tourism_intensity}) - ` +
        `verificar si debería ser otra categoría`
      );
    }
  }

  /**
   * Comparar con datos de referencia
   */
  validateAgainstReferences(data, result) {
    const ref = REFERENCE_DATA[data.name];

    if (ref) {
      // Comparar población
      const popDiff = Math.abs(data.population - ref.population) / ref.population;
      if (popDiff > 0.2) {
        result.addWarning(
          `Población (${data.population}) difiere >20% de referencia (${ref.population})`
        );
      }

      // Comparar plazas
      const placesDiff = Math.abs(data.hotel_places - ref.hotel_places) / ref.hotel_places;
      if (placesDiff > 0.3) {
        result.addWarning(
          `Plazas (${data.hotel_places}) difieren >30% de referencia (${ref.hotel_places})`
        );
      }

      // Comparar intensidad
      const intDiff = Math.abs(data.tourism_intensity - ref.intensity);
      if (intDiff > 0.15) {
        result.addWarning(
          `Intensidad (${data.tourism_intensity}) difiere >0.15 de referencia (${ref.intensity})`
        );
      }
    }
  }

  /**
   * Estimar intensidad basada en ratio plazas/población
   */
  estimateIntensity(placesPerCapita) {
    if (placesPerCapita > 1) return 0.95;
    if (placesPerCapita > 0.5) return 0.85;
    if (placesPerCapita > 0.3) return 0.75;
    if (placesPerCapita > 0.15) return 0.65;
    if (placesPerCapita > 0.08) return 0.55;
    if (placesPerCapita > 0.05) return 0.45;
    if (placesPerCapita > 0.025) return 0.35;
    if (placesPerCapita > 0.015) return 0.25;
    return 0.15;
  }

  /**
   * Validar lote de municipios
   * @param {Array<Object>} municipalities - Lista de municipios
   * @returns {Object} Resumen de validación
   */
  validateBatch(municipalities) {
    const results = {
      total: municipalities.length,
      valid: 0,
      invalid: 0,
      withWarnings: 0,
      details: []
    };

    for (const muni of municipalities) {
      const validation = this.validate(muni);
      results.details.push({
        name: muni.name,
        code: muni.code,
        ...validation.toJSON()
      });

      if (validation.isValid) {
        results.valid++;
        if (validation.warnings.length > 0) {
          results.withWarnings++;
        }
      } else {
        results.invalid++;
      }
    }

    return results;
  }

  /**
   * Auto-corregir datos si es posible
   * @param {Object} data - Datos del municipio
   * @returns {Object} Datos corregidos
   */
  autoCorrect(data) {
    const corrected = { ...data };

    // Normalizar intensidad a rango [0, 1]
    if (corrected.tourism_intensity > 1) {
      corrected.tourism_intensity = corrected.tourism_intensity / 100;
    }
    if (corrected.tourism_intensity < 0) {
      corrected.tourism_intensity = 0;
    }

    // Asegurar valores no negativos
    corrected.population = Math.max(0, Math.round(corrected.population));
    corrected.hotel_places = Math.max(0, Math.round(corrected.hotel_places));

    // Normalizar categoría
    if (corrected.categoria) {
      corrected.categoria = corrected.categoria.toLowerCase().trim();
      if (corrected.categoria === 'montanya' || corrected.categoria === 'montana') {
        corrected.categoria = 'montaña';
      }
      if (corrected.categoria === 'city' || corrected.categoria === 'urbano') {
        corrected.categoria = 'ciudad';
      }
      if (corrected.categoria === 'coast' || corrected.categoria === 'playa') {
        corrected.categoria = 'costa';
      }
    }

    // Recalcular intensidad si parece incorrecta
    if (corrected.population > 0 && corrected.hotel_places > 0) {
      const placesPerCapita = corrected.hotel_places / corrected.population;
      const estimatedIntensity = this.estimateIntensity(placesPerCapita);
      const diff = Math.abs(corrected.tourism_intensity - estimatedIntensity);

      if (diff > 0.4) {
        corrected.tourism_intensity = estimatedIntensity;
        corrected._intensityCorrected = true;
      }
    }

    return corrected;
  }
}

// Exportar instancia singleton
export const validator = new DataValidator();
export default DataValidator;
