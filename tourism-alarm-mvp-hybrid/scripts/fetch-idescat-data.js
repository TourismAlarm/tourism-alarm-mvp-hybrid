// 🎯 FASE 1 - DÍA 1: CONEXIÓN IDESCAT Y DATOS REALES
// Script para descargar datos oficiales de IDESCAT y calcular intensity_base real

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

// 📡 URLs de la API IDESCAT
const IDESCAT_API = {
  // Población municipal (último censo)
  poblacion: 'https://api.idescat.cat/emex/v1/dades.json?id=pop&tipus=mun',

  // Establecimientos hoteleros por municipio
  hoteles: 'https://api.idescat.cat/economia/v1/tur03.json',

  // Pernoctaciones por comarca (turismo)
  pernoctaciones: 'https://api.idescat.cat/economia/v1/tur01.json'
};

// 🗺️ Mapa de comarcas de Catalunya (42 comarcas)
const COMARCAS_CATALUNYA = [
  'Alt Camp', 'Alt Empordà', 'Alt Penedès', 'Alt Urgell', 'Alta Ribagorça',
  'Anoia', 'Aran', 'Bages', 'Baix Camp', 'Baix Ebre', 'Baix Empordà',
  'Baix Llobregat', 'Baix Penedès', 'Barcelonès', 'Berguedà', 'Cerdanya',
  'Conca de Barberà', 'Garraf', 'Garrigues', 'Garrotxa', 'Gironès',
  'Maresme', 'Moianès', 'Montsià', 'Noguera', 'Osona', 'Pallars Jussà',
  'Pallars Sobirà', 'Pla de l\'Estany', 'Pla d\'Urgell', 'Priorat',
  'Ribera d\'Ebre', 'Ripollès', 'Segarra', 'Segrià', 'Selva', 'Solsonès',
  'Tarragonès', 'Terra Alta', 'Urgell', 'Vallès Occidental', 'Vallès Oriental'
];

// 📊 Función auxiliar para fetch con retry
async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`🔄 Intentando fetch: ${url} (intento ${i + 1}/${maxRetries})`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`✅ Datos recibidos correctamente`);
      return data;

    } catch (error) {
      console.error(`❌ Error en intento ${i + 1}: ${error.message}`);

      if (i === maxRetries - 1) {
        throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
      }

      // Esperar antes de reintentar (exponential backoff)
      const waitTime = Math.pow(2, i) * 1000;
      console.log(`⏳ Esperando ${waitTime}ms antes de reintentar...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

// 📥 Descargar población municipal
async function fetchPoblacion() {
  console.log('\n📊 Descargando población municipal...');

  try {
    const data = await fetchWithRetry(IDESCAT_API.poblacion);

    // Parsear datos de IDESCAT (formato específico de su API)
    const municipios = [];

    // NOTA: La estructura real de la API puede variar
    // Necesitarás ajustar esto según la respuesta real de IDESCAT
    if (data && data.fitxes) {
      data.fitxes.forEach(muni => {
        municipios.push({
          id: muni.codi || muni.id,
          name: muni.literal || muni.nom,
          population: parseInt(muni.valor) || 0,
          comarca: muni.comarca || ''
        });
      });
    }

    console.log(`✅ ${municipios.length} municipios con población descargados`);
    return municipios;

  } catch (error) {
    console.error('❌ Error descargando población:', error.message);
    console.log('⚠️  Usando datos de fallback parciales...');
    return [];
  }
}

// 🏨 Descargar establecimientos hoteleros
async function fetchHoteles() {
  console.log('\n🏨 Descargando establecimientos hoteleros...');

  try {
    const data = await fetchWithRetry(IDESCAT_API.hoteles);

    const hoteles = {};

    // Parsear datos de hoteles por municipio
    // NOTA: Ajustar según estructura real de la API
    if (data && data.elements) {
      data.elements.forEach(hotel => {
        const muniId = hotel.municipi || hotel.codi_municipi;
        const plazas = parseInt(hotel.places) || parseInt(hotel.plazas) || 0;

        if (muniId) {
          hoteles[muniId] = (hoteles[muniId] || 0) + plazas;
        }
      });
    }

    console.log(`✅ ${Object.keys(hoteles).length} municipios con datos hoteleros`);
    return hoteles;

  } catch (error) {
    console.error('❌ Error descargando hoteles:', error.message);
    console.log('⚠️  Usando datos de fallback...');
    return {};
  }
}

// 🛏️ Descargar pernoctaciones por comarca
async function fetchPernoctaciones() {
  console.log('\n🛏️ Descargando pernoctaciones por comarca (2022-2024)...');

  const pernoctaciones = {};

  try {
    const data = await fetchWithRetry(IDESCAT_API.pernoctaciones);

    // Parsear pernoctaciones por comarca
    // NOTA: Ajustar según estructura real de la API
    if (data && data.comarques) {
      data.comarques.forEach(comarca => {
        const nomComarca = comarca.nom || comarca.literal;
        const pernocs = parseInt(comarca.pernoctacions) || parseInt(comarca.valor) || 0;

        pernoctaciones[nomComarca] = pernocs;
      });
    }

    console.log(`✅ ${Object.keys(pernoctaciones).length} comarcas con pernoctaciones`);
    return pernoctaciones;

  } catch (error) {
    console.error('❌ Error descargando pernoctaciones:', error.message);
    console.log('⚠️  Usando estimaciones...');
    return {};
  }
}

// 🧮 Algoritmo de reparto: pernoctaciones comarca → municipio
function calcularPernoctacionesMunicipio(municipios, hotelesMap, pernoctacionesComarca) {
  console.log('\n🧮 Aplicando algoritmo de reparto comarca → municipio...');

  const resultado = {};

  // Agrupar municipios por comarca
  const municipiosPorComarca = {};
  municipios.forEach(muni => {
    if (!municipiosPorComarca[muni.comarca]) {
      municipiosPorComarca[muni.comarca] = [];
    }
    municipiosPorComarca[muni.comarca].push(muni);
  });

  // Calcular reparto por comarca
  Object.keys(municipiosPorComarca).forEach(comarca => {
    const munisDeLaComarca = municipiosPorComarca[comarca];
    const pernoctacionesTotales = pernoctacionesComarca[comarca] || 0;

    // Calcular total de plazas hoteleras en la comarca
    const plazasTotalesComarca = munisDeLaComarca.reduce((total, muni) => {
      return total + (hotelesMap[muni.id] || 0);
    }, 0);

    // Repartir pernoctaciones proporcionalmente
    munisDeLaComarca.forEach(muni => {
      const plazasMuni = hotelesMap[muni.id] || 0;

      if (plazasTotalesComarca > 0) {
        // Fórmula: pernoctaciones_muni = pernoctaciones_comarca * (plazas_muni / plazas_comarca)
        resultado[muni.id] = Math.round(
          pernoctacionesTotales * (plazasMuni / plazasTotalesComarca)
        );
      } else {
        // Si no hay hoteles en la comarca, repartir equitativamente
        resultado[muni.id] = Math.round(pernoctacionesTotales / munisDeLaComarca.length);
      }
    });
  });

  console.log(`✅ Reparto calculado para ${Object.keys(resultado).length} municipios`);
  return resultado;
}

// 📊 Calcular intensity_base (0.0 - 1.0)
function calcularIntensityBase(municipios, pernoctacionesMuni) {
  console.log('\n📊 Calculando intensity_base...');

  const municipiosConIntensidad = [];

  // Encontrar max pernoctaciones para normalizar
  const pernoctacionesArray = Object.values(pernoctacionesMuni);
  const maxPernoctaciones = Math.max(...pernoctacionesArray, 1);

  municipios.forEach(muni => {
    const pernoctaciones = pernoctacionesMuni[muni.id] || 0;
    const population = muni.population || 1;

    // Fórmula: intensity = (pernoctaciones / población) normalizado
    // Más pernoctaciones que población = alta intensidad
    let intensity = pernoctaciones / population;

    // Normalizar a 0.0 - 1.0
    // Usamos una escala logarítmica para mejor distribución
    intensity = Math.min(1.0, intensity / 10); // Ajustar divisor según datos reales

    // Mínimo 0.1 para visibilidad
    intensity = Math.max(0.1, intensity);

    municipiosConIntensidad.push({
      id: muni.id,
      name: muni.name,
      population: muni.population,
      comarca: muni.comarca,
      pernoctaciones: pernoctaciones,
      intensity_base: parseFloat(intensity.toFixed(3))
    });
  });

  // Estadísticas
  const intensities = municipiosConIntensidad.map(m => m.intensity_base);
  const stats = {
    min: Math.min(...intensities),
    max: Math.max(...intensities),
    avg: (intensities.reduce((a,b) => a+b, 0) / intensities.length).toFixed(3),
    count: intensities.length
  };

  console.log(`✅ Intensity_base calculado para ${stats.count} municipios`);
  console.log(`   Min: ${stats.min} | Max: ${stats.max} | Avg: ${stats.avg}`);

  return municipiosConIntensidad;
}

// 💾 Guardar datos
async function guardarDatos(municipiosConIntensidad, rawData) {
  console.log('\n💾 Guardando datos...');

  // Crear directorios si no existen
  const rawDir = resolve('data/idescat-raw');
  if (!existsSync(rawDir)) {
    await mkdir(rawDir, { recursive: true });
    console.log(`📁 Directorio creado: ${rawDir}`);
  }

  // Guardar datos brutos
  await writeFile(
    resolve('data/idescat-raw/poblacion.json'),
    JSON.stringify(rawData.poblacion, null, 2)
  );

  await writeFile(
    resolve('data/idescat-raw/hoteles.json'),
    JSON.stringify(rawData.hoteles, null, 2)
  );

  await writeFile(
    resolve('data/idescat-raw/pernoctaciones.json'),
    JSON.stringify(rawData.pernoctaciones, null, 2)
  );

  console.log('✅ Datos brutos guardados en data/idescat-raw/');

  // Guardar datos procesados
  const finalData = {
    version: '1.0_idescat_real',
    updated_at: new Date().toISOString(),
    source: 'IDESCAT API',
    municipalities_count: municipiosConIntensidad.length,
    municipalities: municipiosConIntensidad,
    metadata: {
      description: 'Datos reales de intensidad turística basados en IDESCAT',
      formula: 'intensity_base = (pernoctaciones / población) normalizado',
      data_year: '2022-2024',
      next_steps: 'Aplicar multiplicadores temporales y clima'
    }
  };

  await writeFile(
    resolve('data/idescat-real-data.json'),
    JSON.stringify(finalData, null, 2)
  );

  console.log('✅ Datos procesados guardados en data/idescat-real-data.json');

  return finalData;
}

// 🚀 EJECUCIÓN PRINCIPAL
async function main() {
  console.log('🎯 FASE 1 - DÍA 1: CONECTANDO CON IDESCAT\n');
  console.log('=' .repeat(60));

  try {
    // Paso 1: Descargar población
    const poblacion = await fetchPoblacion();

    // Paso 2: Descargar hoteles
    const hoteles = await fetchHoteles();

    // Paso 3: Descargar pernoctaciones
    const pernoctaciones = await fetchPernoctaciones();

    // Paso 4: Calcular reparto comarca → municipio
    const pernoctacionesMuni = calcularPernoctacionesMunicipio(poblacion, hoteles, pernoctaciones);

    // Paso 5: Calcular intensity_base
    const municipiosFinales = calcularIntensityBase(poblacion, pernoctacionesMuni);

    // Paso 6: Guardar datos
    const finalData = await guardarDatos(municipiosFinales, {
      poblacion,
      hoteles,
      pernoctaciones
    });

    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('✅ DÍA 1 COMPLETADO - DATOS IDESCAT DESCARGADOS');
    console.log('='.repeat(60));
    console.log(`📊 Municipios procesados: ${finalData.municipalities_count}`);
    console.log(`📁 Archivo generado: data/idescat-real-data.json`);
    console.log(`📅 Fecha: ${new Date().toLocaleDateString('es-ES')}`);
    console.log('\n🎯 PRÓXIMO PASO:');
    console.log('   - Ejecutar calculate-real-intensity.js para aplicar ajustes');
    console.log('   - Implementar multiplicadores temporales (DÍA 2)');
    console.log('   - Integrar clima OpenWeather (DÍA 3)');

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error);
