// 🎯 CALCULATE REAL INTENSITY - Combinar datos IDESCAT con coordenadas
// Genera public/data/current.json con datos reales listos para el mapa

import { writeFile } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// 📊 Multiplicadores temporales por categoría de municipio
const TEMPORAL_MULTIPLIERS = {
  costa: {
    1: 0.3, 2: 0.3, 3: 0.4, 4: 0.6, 5: 0.7, 6: 0.9,
    7: 1.5, 8: 1.8, 9: 1.2, 10: 0.7, 11: 0.4, 12: 0.3
  },
  montaña: {
    1: 1.4, 2: 1.3, 3: 1.0, 4: 0.8, 5: 0.7, 6: 0.9,
    7: 1.2, 8: 0.9, 9: 0.7, 10: 0.8, 11: 1.1, 12: 1.5
  },
  ciudad: {
    1: 0.7, 2: 0.7, 3: 0.8, 4: 1.2, 5: 0.9, 6: 1.0,
    7: 0.9, 8: 0.9, 9: 1.0, 10: 1.1, 11: 0.9, 12: 0.8
  },
  interior: {
    1: 0.5, 2: 0.5, 3: 0.6, 4: 0.8, 5: 0.7, 6: 0.7,
    7: 0.7, 8: 0.7, 9: 0.7, 10: 0.6, 11: 0.6, 12: 0.6
  }
};

// 🗺️ Clasificar municipio en categoría (costa/montaña/ciudad/interior)
function clasificarMunicipio(muni) {
  // Ciudad: población > 50,000
  if (muni.population && muni.population > 50000) {
    return 'ciudad';
  }

  // Costa: comarcas costeras conocidas
  const comarcasCosteras = [
    'Alt Empordà', 'Baix Empordà', 'Selva', 'Maresme', 'Barcelonès',
    'Baix Llobregat', 'Garraf', 'Baix Penedès', 'Tarragonès', 'Baix Camp',
    'Baix Ebre', 'Montsià'
  ];

  if (comarcasCosteras.includes(muni.comarca)) {
    return 'costa';
  }

  // Montaña: comarcas pirenaicas
  const comarcasMontaña = [
    'Val d\'Aran', 'Alta Ribagorça', 'Pallars Sobirà', 'Pallars Jussà',
    'Alt Urgell', 'Cerdanya', 'Ripollès', 'Berguedà', 'Garrotxa'
  ];

  if (comarcasMontaña.includes(muni.comarca)) {
    return 'montaña';
  }

  // Resto: interior
  return 'interior';
}

// 📅 Obtener mes actual (para multiplicador temporal)
function getMesActual() {
  return new Date().getMonth() + 1; // 1-12
}

// 🧮 Aplicar multiplicador temporal
function aplicarMultiplicadorTemporal(intensityBase, categoria) {
  const mes = getMesActual();
  const multiplicador = TEMPORAL_MULTIPLIERS[categoria][mes] || 1.0;

  let intensityFinal = intensityBase * multiplicador;

  // Normalizar a 0.0 - 1.0
  intensityFinal = Math.min(1.0, Math.max(0.0, intensityFinal));

  return parseFloat(intensityFinal.toFixed(3));
}

// 📍 Cargar coordenadas desde catalunya-complete.js
async function cargarCoordenadasBase() {
  console.log('📍 Cargando coordenadas base desde catalunya-complete.js...');

  try {
    // Importar dinámicamente el módulo
    const module = await import('../data/catalunya-complete.js');
    const data = module.generateComplete947Municipalities();

    console.log(`✅ ${data.municipalities.length} municipios con coordenadas cargados`);
    return data.municipalities;

  } catch (error) {
    console.error('❌ Error cargando coordenadas:', error.message);
    return [];
  }
}

// 🔗 Combinar datos IDESCAT con coordenadas
async function combinarDatos() {
  console.log('\n🔗 Combinando datos IDESCAT con coordenadas...');

  // Cargar coordenadas base
  const municipiosBase = await cargarCoordenadasBase();

  // Intentar cargar datos IDESCAT si existen
  let datosIDESCAT = null;
  const idescatPath = resolve('data/idescat-real-data.json');

  if (existsSync(idescatPath)) {
    console.log('📊 Cargando datos IDESCAT...');
    const content = await readFile(idescatPath, 'utf-8');
    datosIDESCAT = JSON.parse(content);
    console.log(`✅ ${datosIDESCAT.municipalities.length} municipios IDESCAT cargados`);
  } else {
    console.log('⚠️  datos IDESCAT no encontrados, usando valores base');
  }

  // Crear mapa de datos IDESCAT por ID
  const idescatMap = {};
  if (datosIDESCAT) {
    datosIDESCAT.municipalities.forEach(muni => {
      idescatMap[muni.id] = muni;
    });
  }

  // Combinar datos
  const municipiosFinales = [];
  const heatmapPoints = [];

  municipiosBase.forEach(muniBase => {
    // Obtener datos IDESCAT si existen
    const muniIDESCAT = idescatMap[muniBase.id];

    // Usar intensity_base de IDESCAT o el valor base
    let intensityBase = muniBase.tourism_intensity || 0.3;
    if (muniIDESCAT && muniIDESCAT.intensity_base) {
      intensityBase = muniIDESCAT.intensity_base;
    }

    // Clasificar municipio
    const categoria = clasificarMunicipio(muniBase);

    // Aplicar multiplicador temporal
    const tourismIntensity = aplicarMultiplicadorTemporal(intensityBase, categoria);

    // Crear municipio final
    const municipioFinal = {
      id: muniBase.id,
      name: muniBase.name,
      lat: muniBase.lat,
      lng: muniBase.lng,
      tourism_intensity: tourismIntensity,
      population: muniBase.population || 0,
      comarca: muniBase.comarca || '',
      categoria: categoria,
      intensity_base: intensityBase
    };

    municipiosFinales.push(municipioFinal);

    // Añadir punto para heatmap (usado por el mapa)
    heatmapPoints.push([
      municipioFinal.lat,
      municipioFinal.lng,
      municipioFinal.tourism_intensity
    ]);
  });

  console.log(`✅ ${municipiosFinales.length} municipios procesados`);

  return { municipiosFinales, heatmapPoints };
}

// 📊 Generar estadísticas
function generarEstadisticas(municipios) {
  const intensities = municipios.map(m => m.tourism_intensity);

  return {
    min: Math.min(...intensities).toFixed(3),
    max: Math.max(...intensities).toFixed(3),
    avg: (intensities.reduce((a,b) => a+b, 0) / intensities.length).toFixed(3),
    count: intensities.length
  };
}

// 💾 Guardar current.json
async function guardarCurrentJSON(municipios, points) {
  console.log('\n💾 Generando public/data/current.json...');

  const stats = generarEstadisticas(municipios);

  const currentData = {
    version: '3.0_real_data',
    updated_at: new Date().toISOString(),
    source: 'IDESCAT + coordenadas verificadas',
    method: 'intensity_base * multiplicador_temporal',
    mes_actual: getMesActual(),
    total_municipalities: municipios.length,
    municipalities_count: municipios.length,
    real_coordinates_count: municipios.filter(m => m.lat && m.lng).length,
    municipalities: municipios,
    points: points,
    statistics: stats
  };

  // Guardar current.json
  await writeFile(
    resolve('public/data/current.json'),
    JSON.stringify(currentData, null, 2)
  );

  console.log('✅ public/data/current.json creado');

  // Actualizar last-good.json como backup
  await writeFile(
    resolve('public/data/last-good.json'),
    JSON.stringify(currentData, null, 2)
  );

  console.log('✅ public/data/last-good.json actualizado');

  return currentData;
}

// 🚀 EJECUCIÓN PRINCIPAL
async function main() {
  console.log('🎯 CALCULATE REAL INTENSITY - GENERANDO DATOS FINALES\n');
  console.log('=' .repeat(60));

  try {
    // Paso 1: Combinar datos
    const { municipiosFinales, heatmapPoints } = await combinarDatos();

    // Paso 2: Guardar current.json
    const finalData = await guardarCurrentJSON(municipiosFinales, heatmapPoints);

    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('✅ DATOS FINALES GENERADOS CORRECTAMENTE');
    console.log('='.repeat(60));
    console.log(`📊 Total municipios: ${finalData.total_municipalities}`);
    console.log(`📍 Coordenadas reales: ${finalData.real_coordinates_count}`);
    console.log(`🗺️ Puntos heatmap: ${finalData.points.length}`);
    console.log(`📈 Intensidad: min=${finalData.statistics.min} max=${finalData.statistics.max} avg=${finalData.statistics.avg}`);
    console.log(`📅 Mes actual: ${finalData.mes_actual} (ajuste temporal aplicado)`);
    console.log(`📁 Archivo: public/data/current.json`);

    // Mostrar top 10 municipios con mayor intensidad
    console.log('\n🔝 TOP 10 MUNICIPIOS MÁS TURÍSTICOS:');
    const top10 = finalData.municipalities
      .sort((a, b) => b.tourism_intensity - a.tourism_intensity)
      .slice(0, 10);

    top10.forEach((muni, index) => {
      console.log(`   ${index + 1}. ${muni.name.padEnd(30)} ${(muni.tourism_intensity * 100).toFixed(0)}% (${muni.categoria})`);
    });

    // Mostrar distribución por colores
    console.log('\n🎨 DISTRIBUCIÓN DE COLORES:');
    const rojo = finalData.municipalities.filter(m => m.tourism_intensity > 0.8).length;
    const naranja = finalData.municipalities.filter(m => m.tourism_intensity > 0.6 && m.tourism_intensity <= 0.8).length;
    const amarillo = finalData.municipalities.filter(m => m.tourism_intensity > 0.4 && m.tourism_intensity <= 0.6).length;
    const verdeLima = finalData.municipalities.filter(m => m.tourism_intensity > 0.2 && m.tourism_intensity <= 0.4).length;
    const verde = finalData.municipalities.filter(m => m.tourism_intensity <= 0.2).length;

    console.log(`   🔴 Rojo (>80%):     ${rojo} municipios`);
    console.log(`   🟠 Naranja (60-80%): ${naranja} municipios`);
    console.log(`   🟡 Amarillo (40-60%): ${amarillo} municipios`);
    console.log(`   🟢 Verde-lima (20-40%): ${verdeLima} municipios`);
    console.log(`   🟢 Verde (<20%):    ${verde} municipios`);

    console.log('\n🎯 PRÓXIMOS PASOS:');
    console.log('   1. npm run dev - Verificar mapa visualmente');
    console.log('   2. Validar municipios clave (Barcelona, Lloret, etc.)');
    console.log('   3. Integrar OpenWeather (DÍA 3)');
    console.log('   4. Implementar Ticketmaster/TomTom (DÍA 5)');

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error);
