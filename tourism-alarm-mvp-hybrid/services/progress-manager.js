// 💾 SISTEMA DE GUARDADO Y RECUPERACIÓN DE PROGRESO
// Permite pausar y reanudar el procesamiento de municipios
// Guarda estado en JSON para persistencia

import fs from 'fs';
import path from 'path';

const PROGRESS_DIR = './data/progress';
const PROGRESS_FILE = 'agent-progress.json';

/**
 * Estado de procesamiento de un municipio
 */
const STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

/**
 * Gestor de progreso para el agente de scraping
 */
export class ProgressManager {
  constructor(sessionId = null) {
    this.sessionId = sessionId || this.generateSessionId();
    this.progressFile = path.join(PROGRESS_DIR, `${this.sessionId}-${PROGRESS_FILE}`);
    this.state = null;
    this.autosaveInterval = null;
  }

  /**
   * Generar ID de sesión único
   */
  generateSessionId() {
    const now = new Date();
    return `session-${now.toISOString().slice(0, 10)}-${now.getTime().toString(36)}`;
  }

  /**
   * Inicializar o cargar estado existente
   * @param {Array<Object>} municipalities - Lista de municipios a procesar
   * @returns {Object} Estado actual
   */
  async initialize(municipalities = []) {
    // Crear directorio si no existe
    if (!fs.existsSync(PROGRESS_DIR)) {
      fs.mkdirSync(PROGRESS_DIR, { recursive: true });
    }

    // Intentar cargar estado existente
    if (fs.existsSync(this.progressFile)) {
      try {
        const saved = JSON.parse(fs.readFileSync(this.progressFile, 'utf-8'));
        this.state = saved;
        console.log(`📂 Progreso cargado: ${this.getStats().completed}/${this.getStats().total} completados`);
        return this.state;
      } catch (error) {
        console.warn('⚠️ Error cargando progreso, iniciando nuevo:', error.message);
      }
    }

    // Inicializar nuevo estado
    this.state = {
      sessionId: this.sessionId,
      startedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      config: {
        provider: null,
        batchSize: 0,
        delayMs: 0
      },
      municipalities: {},
      results: {},
      errors: [],
      stats: {
        total: 0,
        completed: 0,
        failed: 0,
        skipped: 0
      }
    };

    // Poblar municipios
    for (const muni of municipalities) {
      this.state.municipalities[muni.code] = {
        code: muni.code,
        name: muni.name,
        category: muni.category,
        priority: muni.priority,
        status: STATUS.PENDING,
        attempts: 0,
        lastAttempt: null
      };
    }

    this.state.stats.total = municipalities.length;
    await this.save();

    return this.state;
  }

  /**
   * Obtener siguiente municipio pendiente
   * @param {number} maxPriority - Prioridad máxima a considerar
   * @returns {Object|null} Siguiente municipio o null
   */
  getNext(maxPriority = 3) {
    const pending = Object.values(this.state.municipalities)
      .filter(m => m.status === STATUS.PENDING && m.priority <= maxPriority)
      .sort((a, b) => a.priority - b.priority);

    return pending[0] || null;
  }

  /**
   * Obtener todos los pendientes
   * @returns {Array<Object>} Lista de municipios pendientes
   */
  getPending() {
    return Object.values(this.state.municipalities)
      .filter(m => m.status === STATUS.PENDING)
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Marcar municipio como en progreso
   * @param {string} code - Código del municipio
   */
  markInProgress(code) {
    if (this.state.municipalities[code]) {
      this.state.municipalities[code].status = STATUS.IN_PROGRESS;
      this.state.municipalities[code].lastAttempt = new Date().toISOString();
      this.state.municipalities[code].attempts++;
      this.state.lastUpdated = new Date().toISOString();
    }
  }

  /**
   * Marcar municipio como completado
   * @param {string} code - Código del municipio
   * @param {Object} result - Datos obtenidos
   */
  async markCompleted(code, result) {
    if (this.state.municipalities[code]) {
      this.state.municipalities[code].status = STATUS.COMPLETED;
      this.state.municipalities[code].completedAt = new Date().toISOString();
      this.state.results[code] = result;
      this.state.stats.completed++;
      this.state.lastUpdated = new Date().toISOString();
      await this.save();
    }
  }

  /**
   * Marcar municipio como fallido
   * @param {string} code - Código del municipio
   * @param {string} error - Mensaje de error
   */
  async markFailed(code, error) {
    if (this.state.municipalities[code]) {
      const muni = this.state.municipalities[code];

      // Reintentar si menos de 3 intentos
      if (muni.attempts < 3) {
        muni.status = STATUS.PENDING;
        muni.lastError = error;
      } else {
        muni.status = STATUS.FAILED;
        this.state.stats.failed++;
        this.state.errors.push({
          code,
          name: muni.name,
          error,
          timestamp: new Date().toISOString()
        });
      }

      this.state.lastUpdated = new Date().toISOString();
      await this.save();
    }
  }

  /**
   * Saltar municipio
   * @param {string} code - Código del municipio
   * @param {string} reason - Razón para saltar
   */
  async skip(code, reason) {
    if (this.state.municipalities[code]) {
      this.state.municipalities[code].status = STATUS.SKIPPED;
      this.state.municipalities[code].skipReason = reason;
      this.state.stats.skipped++;
      this.state.lastUpdated = new Date().toISOString();
      await this.save();
    }
  }

  /**
   * Obtener estadísticas actuales
   * @returns {Object} Estadísticas
   */
  getStats() {
    const municipalities = Object.values(this.state.municipalities);

    return {
      total: municipalities.length,
      completed: municipalities.filter(m => m.status === STATUS.COMPLETED).length,
      failed: municipalities.filter(m => m.status === STATUS.FAILED).length,
      skipped: municipalities.filter(m => m.status === STATUS.SKIPPED).length,
      pending: municipalities.filter(m => m.status === STATUS.PENDING).length,
      inProgress: municipalities.filter(m => m.status === STATUS.IN_PROGRESS).length,
      progress: municipalities.length > 0
        ? ((municipalities.filter(m => m.status === STATUS.COMPLETED).length / municipalities.length) * 100).toFixed(1)
        : 0
    };
  }

  /**
   * Guardar estado a disco
   */
  async save() {
    try {
      fs.writeFileSync(
        this.progressFile,
        JSON.stringify(this.state, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Error guardando progreso:', error.message);
    }
  }

  /**
   * Iniciar auto-guardado periódico
   * @param {number} intervalMs - Intervalo en milisegundos
   */
  startAutosave(intervalMs = 30000) {
    this.stopAutosave();
    this.autosaveInterval = setInterval(() => this.save(), intervalMs);
  }

  /**
   * Detener auto-guardado
   */
  stopAutosave() {
    if (this.autosaveInterval) {
      clearInterval(this.autosaveInterval);
      this.autosaveInterval = null;
    }
  }

  /**
   * Exportar resultados a formato de real-tourism-data.js
   * @returns {Object} Datos formateados
   */
  exportResults() {
    const output = {};

    for (const [code, result] of Object.entries(this.state.results)) {
      if (result && result.name) {
        output[code] = {
          name: result.name,
          population: result.population || 0,
          hotel_places: result.hotel_places || 0,
          tourism_intensity: result.tourism_intensity || 0.15,
          categoria: result.categoria || 'interior'
        };
      }
    }

    return output;
  }

  /**
   * Generar código JavaScript para añadir a real-tourism-data.js
   * @returns {string} Código JS
   */
  generateCode() {
    const results = this.exportResults();
    const entries = Object.entries(results)
      .map(([code, data]) => {
        return `  '${code}': { name: '${data.name}', population: ${data.population}, hotel_places: ${data.hotel_places}, tourism_intensity: ${data.tourism_intensity.toFixed(2)}, categoria: '${data.categoria}' }`;
      })
      .join(',\n');

    return `// Datos generados por el agente - ${new Date().toISOString()}\n// Session: ${this.sessionId}\n\n${entries}`;
  }

  /**
   * Listar todas las sesiones guardadas
   * @returns {Array<Object>} Lista de sesiones
   */
  static listSessions() {
    if (!fs.existsSync(PROGRESS_DIR)) {
      return [];
    }

    const files = fs.readdirSync(PROGRESS_DIR)
      .filter(f => f.endsWith(PROGRESS_FILE));

    return files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(PROGRESS_DIR, f), 'utf-8'));
        return {
          file: f,
          sessionId: data.sessionId,
          startedAt: data.startedAt,
          lastUpdated: data.lastUpdated,
          stats: data.stats
        };
      } catch {
        return { file: f, error: 'Cannot parse' };
      }
    });
  }

  /**
   * Cargar sesión específica
   * @param {string} sessionId - ID de sesión
   * @returns {ProgressManager} Manager con sesión cargada
   */
  static loadSession(sessionId) {
    const manager = new ProgressManager(sessionId);
    if (fs.existsSync(manager.progressFile)) {
      manager.state = JSON.parse(fs.readFileSync(manager.progressFile, 'utf-8'));
      return manager;
    }
    return null;
  }

  /**
   * Generar reporte de progreso
   * @returns {string} Reporte formateado
   */
  generateReport() {
    const stats = this.getStats();

    let report = `
╔══════════════════════════════════════════════════════════════╗
║                    REPORTE DE PROGRESO                       ║
╠══════════════════════════════════════════════════════════════╣
║  Sesión: ${this.sessionId.padEnd(50)}║
║  Inicio: ${this.state.startedAt.padEnd(50)}║
║  Última actualización: ${this.state.lastUpdated.padEnd(36)}║
╠══════════════════════════════════════════════════════════════╣
║  ESTADÍSTICAS:                                               ║
║  • Total municipios: ${String(stats.total).padEnd(39)}║
║  • Completados: ${String(stats.completed).padEnd(44)}║
║  • Fallidos: ${String(stats.failed).padEnd(47)}║
║  • Saltados: ${String(stats.skipped).padEnd(47)}║
║  • Pendientes: ${String(stats.pending).padEnd(45)}║
║  • Progreso: ${(stats.progress + '%').padEnd(47)}║
╚══════════════════════════════════════════════════════════════╝
`;

    if (this.state.errors.length > 0) {
      report += '\n⚠️ ÚLTIMOS ERRORES:\n';
      for (const err of this.state.errors.slice(-5)) {
        report += `  • ${err.name}: ${err.error}\n`;
      }
    }

    return report;
  }
}

// Exportar constantes
export { STATUS };
export default ProgressManager;
