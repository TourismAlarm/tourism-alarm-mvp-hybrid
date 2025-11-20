// 🧪 DATOS MOCK PARA TESTING (sin API de Claude)
// Estos son datos de ejemplo para probar el sistema antes de usar la API real

export const MOCK_ENRICHED_DATA = {
  // Berguedà - Zona montaña
  '80522': {
    name: 'Castellar de n\'Hug',
    population: 156,
    hotel_places: 50,
    tourism_intensity: 0.42,
    categoria: 'montaña',
    confidence: 0.85,
    source: 'MOCK_DATA'
  },
  '80996': {
    name: 'Guardiola de Berguedà',
    population: 964,
    hotel_places: 120,
    tourism_intensity: 0.35,
    categoria: 'montaña',
    confidence: 0.78,
    source: 'MOCK_DATA'
  },
  '80044': {
    name: 'Alpens',
    population: 387,
    hotel_places: 30,
    tourism_intensity: 0.25,
    categoria: 'interior',
    confidence: 0.72,
    source: 'MOCK_DATA'
  },

  // Costa Brava interior
  '170329': {
    name: 'Cadaqués',
    population: 2781,
    hotel_places: 2500,
    tourism_intensity: 0.85,
    categoria: 'costa',
    confidence: 0.95,
    source: 'MOCK_DATA'
  },
  '170854': {
    name: "L'Escala",
    population: 10717,
    hotel_places: 6000,
    tourism_intensity: 0.70,
    categoria: 'costa',
    confidence: 0.92,
    source: 'MOCK_DATA'
  },

  // Ripollès
  '171925': {
    name: 'Setcases',
    population: 184,
    hotel_places: 200,
    tourism_intensity: 0.65,
    categoria: 'montaña',
    confidence: 0.88,
    source: 'MOCK_DATA'
  },
  '170433': {
    name: 'Queralbs',
    population: 212,
    hotel_places: 150,
    tourism_intensity: 0.55,
    categoria: 'montaña',
    confidence: 0.82,
    source: 'MOCK_DATA'
  },

  // Garrotxa
  '170195': {
    name: 'Besalú',
    population: 2482,
    hotel_places: 300,
    tourism_intensity: 0.45,
    categoria: 'interior',
    confidence: 0.87,
    source: 'MOCK_DATA'
  },
  '171848': {
    name: 'Santa Pau',
    population: 1745,
    hotel_places: 200,
    tourism_intensity: 0.38,
    categoria: 'interior',
    confidence: 0.79,
    source: 'MOCK_DATA'
  },

  // Alt Empordà
  '171404': {
    name: 'El Port de la Selva',
    population: 960,
    hotel_places: 800,
    tourism_intensity: 0.72,
    categoria: 'costa',
    confidence: 0.91,
    source: 'MOCK_DATA'
  }
};

// Función para copiar fácilmente a real-tourism-data.js
export function generateCodeSnippet() {
  console.log('// === DATOS MOCK PARA TESTING ===');
  Object.entries(MOCK_ENRICHED_DATA).forEach(([code, data]) => {
    console.log(`  '${code}': { name: '${data.name}', population: ${data.population}, hotel_places: ${data.hotel_places}, tourism_intensity: ${data.tourism_intensity}, categoria: '${data.categoria}' }, // ${data.source} (${(data.confidence * 100).toFixed(0)}%)`);
  });
}

// Si ejecutas este archivo directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🧪 DATOS MOCK PARA TESTING\n');
  generateCodeSnippet();
  console.log('\n📋 Copia este código a data/real-tourism-data.js');
  console.log('💡 Son 10 municipios adicionales para probar el sistema');
}
