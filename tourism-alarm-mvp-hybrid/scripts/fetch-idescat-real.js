// 🎯 FETCH IDESCAT REAL - Descargar 947 municipios reales desde API oficial
// Este script elimina completamente el sistema "densified" y obtiene datos oficiales

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// 📡 URLs de la API IDESCAT
const IDESCAT_API_BASE = 'https://api.idescat.cat/emex/v1';

// 🗺️ IDs de campos en la API IDESCAT
const FIELD_IDS = {
  latitud: 'f329',        // Latitud geográfica
  longitud: 'f328',       // Longitud geográfica
  poblacion: 'f321',      // Población total
  hotels: 'f215',         // Número de hoteles
  plazas_hotel: 'f216',   // Plazas hoteleras
  superficie: 'f271'      // Superficie en km²
};

// 📊 Esperar entre peticiones para no sobrecargar la API
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 📥 Obtener lista de 947 municipios
async function fetchMunicipalityList() {
  console.log('📥 Descargando lista de 947 municipios...');

  const response = await fetch(`${IDESCAT_API_BASE}/nodes.json`);
  const data = await response.json();

  const municipios = [];

  function extractMun(obj) {
    if (typeof obj === 'object' && obj !== null) {
      if (obj.scheme === 'mun' && obj.id && obj.content) {
        municipios.push({
          id: obj.id,
          name: obj.content
        });
      }

      Object.values(obj).forEach(val => extractMun(val));
    } else if (Array.isArray(obj)) {
      obj.forEach(item => extractMun(item));
    }
  }

  extractMun(data);

  console.log(`✅ ${municipios.length} municipios encontrados`);
  return municipios;
}

// 🔍 Extraer valor de un campo específico
function extractField(data, fieldId) {
  let result = null;

  function search(obj) {
    if (result !== null) return; // Ya lo encontramos

    if (typeof obj === 'object' && obj !== null) {
      if (obj.id === fieldId && obj.v) {
        // El formato es "valor1,valor2,valor3" donde valor1 es el municipio
        const values = obj.v.split(',');
        const value = values[0];

        // Si es '_' o vacío, retornar null
        if (value === '_' || value === '') {
          result = null;
        } else {
          result = value;
        }
        return;
      }

      Object.values(obj).forEach(val => search(val));
    } else if (Array.isArray(obj)) {
      obj.forEach(item => search(item));
    }
  }

  search(data);
  return result;
}

// 📊 Obtener datos completos de un municipio
async function fetchMunicipalityData(municipio, index, total) {
  const progress = `[${index}/${total}]`;

  try {
    const response = await fetch(`${IDESCAT_API_BASE}/dades.json?id=${municipio.id}`);

    if (!response.ok) {
      console.warn(`${progress} ⚠️  ${municipio.name}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Extraer todos los campos
    const lat = extractField(data, FIELD_IDS.latitud);
    const lng = extractField(data, FIELD_IDS.longitud);
    const poblacion = extractField(data, FIELD_IDS.poblacion);
    const hotels = extractField(data, FIELD_IDS.hotels);
    const plazas = extractField(data, FIELD_IDS.plazas_hotel);

    const result = {
      id: municipio.id,
      name: municipio.name,
      lat: lat ? parseFloat(lat) : null,
      lng: lng ? parseFloat(lng) : null,
      population: poblacion ? parseInt(poblacion) : 0,
      hotels: hotels ? parseInt(hotels) : 0,
      hotel_places: plazas ? parseInt(plazas) : 0
    };

    // Log progreso cada 50 municipios
    if (index % 50 === 0 || index === total) {
      console.log(`${progress} ✅ ${municipio.name}`);
    }

    return result;

  } catch (error) {
    console.warn(`${progress} ❌ ${municipio.name}: ${error.message}`);
    return null;
  }
}

// 🧮 Calcular intensity_base desde datos reales
function calculateIntensityBase(municipio) {
  // Fórmula: Basada en plazas hoteleras per cápita

  if (!municipio.population || municipio.population === 0) {
    return 0.1; // Mínimo para visibilidad
  }

  // Plazas hoteleras por cada 1000 habitantes
  const plazasPer1000 = (municipio.hotel_places / municipio.population) * 1000;

  // Escala logarítmica para mejor distribución
  // Municipios turísticos tienen >100 plazas por 1000 hab
  // Barcelona: ~22 plazas/1000hab
  // Lloret de Mar: ~300 plazas/1000hab

  let intensity;

  if (plazasPer1000 > 200) {
    intensity = 0.85; // Muy alta: Lloret, Salou, etc.
  } else if (plazasPer1000 > 100) {
    intensity = 0.70; // Alta: Costa Brava, Costa Dorada
  } else if (plazasPer1000 > 50) {
    intensity = 0.55; // Media-alta: Sitges, Cadaqués
  } else if (plazasPer1000 > 20) {
    intensity = 0.40; // Media: Barcelona, capitales
  } else if (plazasPer1000 > 5) {
    intensity = 0.25; // Baja: Ciudades sin turismo
  } else {
    intensity = 0.15; // Muy baja: Interior rural
  }

  // Ajuste adicional para ciudades grandes
  if (municipio.population > 500000) {
    intensity = Math.min(0.85, intensity + 0.10); // Barcelona ajuste
  }

  return parseFloat(intensity.toFixed(3));
}

// 🗺️ Clasificar municipio por comarca (desde código INE)
function getComarcaFromCode(code) {
  // Los códigos INE tienen formato: PPMMM
  // PP = provincia, MMM = municipio
  const provincia = code.substring(0, 2);

  // Mapeo simplificado provincia → comarca principal
  const comarcas = {
    '08': 'Barcelona',     // Barcelona
    '17': 'Girona',        // Girona
    '25': 'Lleida',        // Lleida
    '43': 'Tarragona'      // Tarragona
  };

  return comarcas[provincia] || 'Catalunya';
}

// 💾 Guardar datos
async function saveData(municipios) {
  console.log('\n💾 Guardando datos...');

  // Crear directorio si no existe
  const rawDir = resolve('data/idescat-raw');
  if (!existsSync(rawDir)) {
    await mkdir(rawDir, { recursive: true });
  }

  // Guardar datos brutos
  await writeFile(
    resolve('data/idescat-raw/municipalities-raw.json'),
    JSON.stringify(municipios, null, 2)
  );

  console.log(`✅ Datos brutos guardados: data/idescat-raw/municipalities-raw.json`);

  // Calcular intensity_base para cada municipio
  const municipiosConIntensidad = municipios.map(m => ({
    ...m,
    intensity_base: calculateIntensityBase(m),
    comarca: getComarcaFromCode(m.id)
  }));

  // Generar estadísticas
  const stats = {
    total: municipiosConIntensidad.length,
    con_coordenadas: municipiosConIntensidad.filter(m => m.lat && m.lng).length,
    con_hoteles: municipiosConIntensidad.filter(m => m.hotels > 0).length,
    intensity_min: Math.min(...municipiosConIntensidad.map(m => m.intensity_base)),
    intensity_max: Math.max(...municipiosConIntensidad.map(m => m.intensity_base)),
    intensity_avg: (municipiosConIntensidad.reduce((sum, m) => sum + m.intensity_base, 0) / municipiosConIntensidad.length).toFixed(3)
  };

  const finalData = {
    version: '4.0_idescat_real',
    updated_at: new Date().toISOString(),
    source: 'IDESCAT API oficial',
    method: 'Plazas hoteleras per cápita',
    total_municipalities: stats.total,
    municipalities: municipiosConIntensidad,
    statistics: stats
  };

  await writeFile(
    resolve('data/idescat-real-data.json'),
    JSON.stringify(finalData, null, 2)
  );

  console.log(`✅ Datos procesados guardados: data/idescat-real-data.json`);

  return { finalData, stats };
}

// 🚀 EJECUCIÓN PRINCIPAL
async function main() {
  console.log('🎯 FETCH IDESCAT REAL - DESCARGANDO 947 MUNICIPIOS OFICIALES\n');
  console.log('=' .repeat(70));

  const startTime = Date.now();

  try {
    // Paso 1: Obtener lista de municipios
    const municipios = await fetchMunicipalityList();

    // Paso 2: Descargar datos de cada municipio
    console.log(`\n📡 Descargando datos de ${municipios.length} municipios...`);
    console.log('⏳ Esto tomará ~5-10 minutos (evitando sobrecarga de API)\n');

    const allData = [];

    for (let i = 0; i < municipios.length; i++) {
      const data = await fetchMunicipalityData(municipios[i], i + 1, municipios.length);

      if (data) {
        allData.push(data);
      }

      // Esperar 50ms entre peticiones para no sobrecargar la API
      if (i < municipios.length - 1) {
        await sleep(50);
      }
    }

    console.log(`\n✅ Datos descargados: ${allData.length}/${municipios.length} municipios`);

    // Paso 3: Guardar datos
    const { finalData, stats } = await saveData(allData);

    // Resumen final
    const elapsedTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

    console.log('\n' + '='.repeat(70));
    console.log('✅ DESCARGA COMPLETADA');
    console.log('='.repeat(70));
    console.log(`⏱️  Tiempo: ${elapsedTime} minutos`);
    console.log(`📊 Municipios totales: ${stats.total}`);
    console.log(`📍 Con coordenadas: ${stats.con_coordenadas}`);
    console.log(`🏨 Con hoteles: ${stats.con_hoteles}`);
    console.log(`📈 Intensity: min=${stats.intensity_min} max=${stats.intensity_max} avg=${stats.intensity_avg}`);

    // Top 10 más turísticos
    console.log('\n🔝 TOP 10 MUNICIPIOS MÁS TURÍSTICOS:');
    const top10 = finalData.municipalities
      .sort((a, b) => b.intensity_base - a.intensity_base)
      .slice(0, 10);

    top10.forEach((m, i) => {
      const plazasPer1000 = m.population > 0 ? ((m.hotel_places / m.population) * 1000).toFixed(0) : 0;
      console.log(`   ${i + 1}. ${m.name.padEnd(30)} ${(m.intensity_base * 100).toFixed(0)}% (${plazasPer1000} plazas/1000hab)`);
    });

    // Municipios sin coordenadas
    const sinCoords = allData.filter(m => !m.lat || !m.lng);
    if (sinCoords.length > 0) {
      console.log(`\n⚠️  ADVERTENCIA: ${sinCoords.length} municipios sin coordenadas`);
      console.log('   Estos municipios necesitarán coordenadas del TopoJSON');
    }

    console.log('\n🎯 PRÓXIMO PASO:');
    console.log('   node scripts/calculate-real-intensity.js');
    console.log('   → Generar current.json con ajustes temporales');

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Ejecutar
main().catch(console.error);
