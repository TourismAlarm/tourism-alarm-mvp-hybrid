import { readFile, writeFile } from 'node:fs/promises';

/**
 * APLICACIÓN DIRECTA DE DATOS HISTÓRICOS DE OCUPACIÓN
 * Reemplaza multiplicadores con valores absolutos históricos 2006-2024
 */

function getCurrentMonth() {
  const now = new Date();
  const months = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];
  return months[now.getMonth()];
}

function parseHistoricalCSV(csvContent) {
  const lines = csvContent.split('\n').filter(line => line.trim());
  const occupationMap = {};

  // Skip header
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 4) {
      const zona = parts[0];
      const mes = parts[1];
      const promedio = parseFloat(parts[3]);

      const key = `${zona}_${mes}`;
      occupationMap[key] = promedio;
    }
  }

  return occupationMap;
}

function getTourismCategory(intensity) {
  if (intensity >= 0.80) return 'extreme';
  if (intensity >= 0.60) return 'critical';
  if (intensity >= 0.40) return 'high';
  if (intensity >= 0.20) return 'medium';
  if (intensity >= 0.10) return 'low';
  return 'minimal';
}

async function applyHistoricalDataDirectly() {
  console.log('📊 APLICANDO DATOS HISTÓRICOS DIRECTAMENTE (2006-2024)');
  console.log('===================================================\\n');

  try {
    // 1. LEER CSV DE PROMEDIOS HISTÓRICOS
    console.log('📖 Cargando promedios históricos...');
    const csvContent = await readFile('data/occupation-averages-2006-2024.csv', 'utf-8');
    const occupationMap = parseHistoricalCSV(csvContent);

    console.log(`✅ ${Object.keys(occupationMap).length} registros zona-mes cargados\\n`);

    // 2. LEER DATOS ACTUALES
    console.log('📖 Cargando sistema actual...');
    const data = JSON.parse(await readFile('public/data/current.json', 'utf-8'));
    console.log(`✅ ${data.municipalities.length} municipios cargados\\n`);

    // 3. DETECTAR MES ACTUAL
    const currentMonth = getCurrentMonth();
    console.log(`📅 Aplicando datos históricos para: ${currentMonth}\\n`);

    // 4. MOSTRAR DATOS HISTÓRICOS DISPONIBLES
    console.log('🏛️ OCUPACIÓN HISTÓRICA POR ZONA (OCTUBRE 2006-2024):');
    console.log('===================================================\\n');

    const zoneOccupations = {};
    Object.entries(occupationMap).forEach(([key, value]) => {
      if (key.includes('_octubre')) {
        const zone = key.replace('_octubre', '');
        zoneOccupations[zone] = value;
      }
    });

    Object.entries(zoneOccupations)
      .sort((a, b) => b[1] - a[1])
      .forEach(([zone, occupation]) => {
        const emoji = occupation >= 70 ? '🔴' : occupation >= 50 ? '🟡' : occupation >= 30 ? '🟢' : '🔵';
        console.log(`  ${zone}: ${occupation.toFixed(1)}% ${emoji}`);
      });

    // 5. APLICAR OCUPACIÓN HISTÓRICA DIRECTAMENTE
    console.log('\\n🔄 Aplicando datos históricos directos...');

    let appliedCount = 0;
    let fallbackCount = 0;

    const updatedMunicipalities = data.municipalities.map(muni => {
      const zone = muni.tourist_zone;
      const key = `${zone}_${currentMonth}`;
      const historicalOccupation = occupationMap[key];

      if (historicalOccupation && historicalOccupation > 0) {
        // Aplicar ocupación histórica directamente
        const directIntensity = historicalOccupation / 100;
        const category = getTourismCategory(directIntensity);

        appliedCount++;

        return {
          ...muni,
          tourism_intensity: parseFloat(directIntensity.toFixed(4)),
          tourism_category: category,
          historical_data: {
            method: 'direct_historical_application',
            month: currentMonth,
            historical_occupation_percent: historicalOccupation,
            years_averaged: 19,
            data_source: 'IDESCAT_2006_2024_averages',
            zone: zone,
            applied_at: new Date().toISOString()
          }
        };
      } else {
        // Fallback: mantener datos anteriores
        fallbackCount++;
        return {
          ...muni,
          historical_data: {
            method: 'fallback_no_historical_data',
            zone: zone,
            note: 'No historical data available for this zone'
          }
        };
      }
    });

    // 6. ESTADÍSTICAS DE APLICACIÓN
    console.log('\\n📊 ESTADÍSTICAS DE APLICACIÓN DIRECTA:');
    console.log(`  📈 Con datos históricos: ${appliedCount}`);
    console.log(`  ⚠️ Sin datos históricos: ${fallbackCount}\\n`);

    // 7. NUEVA DISTRIBUCIÓN DE CATEGORÍAS
    const newCategories = {
      extreme: updatedMunicipalities.filter(m => m.tourism_category === 'extreme').length,
      critical: updatedMunicipalities.filter(m => m.tourism_category === 'critical').length,
      high: updatedMunicipalities.filter(m => m.tourism_category === 'high').length,
      medium: updatedMunicipalities.filter(m => m.tourism_category === 'medium').length,
      low: updatedMunicipalities.filter(m => m.tourism_category === 'low').length,
      minimal: updatedMunicipalities.filter(m => m.tourism_category === 'minimal').length
    };

    console.log('📊 NUEVA DISTRIBUCIÓN (DATOS HISTÓRICOS DIRECTOS):');
    console.log('===============================================\\n');
    console.log(`  🔴 Extrema: ${newCategories.extreme}`);
    console.log(`  🔴 Crítica: ${newCategories.critical}`);
    console.log(`  🟠 Alta: ${newCategories.high}`);
    console.log(`  🟡 Media: ${newCategories.medium}`);
    console.log(`  🟢 Baja: ${newCategories.low}`);
    console.log(`  🟢 Mínima: ${newCategories.minimal}\\n`);

    // 8. VALIDACIÓN POST-CORRECCIÓN
    console.log('🎯 VALIDACIÓN POST-CORRECCIÓN (DATOS HISTÓRICOS DIRECTOS):');
    console.log('========================================================\\n');

    const toCheck = ['Barcelona', 'Salou', 'Lloret de Mar', 'Sitges', 'Vielha e Mijaran'];

    toCheck.forEach(name => {
      const found = updatedMunicipalities.find(m => m.name === name);
      if (found) {
        const intensity = found.tourism_intensity * 100;
        const emoji = intensity >= 70 ? '🔴' :
                     intensity >= 50 ? '🟡' :
                     intensity >= 30 ? '🟢' : '🔵';

        console.log(`${emoji} ${name}:`);
        console.log(`   Intensidad: ${intensity.toFixed(1)}% (${found.tourism_category})`);

        if (found.historical_data?.historical_occupation_percent) {
          console.log(`   Ocupación histórica: ${found.historical_data.historical_occupation_percent.toFixed(1)}%`);
          console.log(`   Zona: ${found.tourist_zone}`);
          console.log(`   Años promediados: ${found.historical_data.years_averaged}`);
        } else {
          console.log(`   ⚠️ Sin datos históricos para zona: ${found.tourist_zone}`);
        }
        console.log('');
      }
    });

    // 9. COMPARACIÓN CON DATOS ANTERIORES
    console.log('⚖️ COMPARACIÓN CON SISTEMA ANTERIOR:');
    console.log('==================================\\n');

    const comparisons = [];
    toCheck.forEach(name => {
      const newMuni = updatedMunicipalities.find(m => m.name === name);
      const oldMuni = data.municipalities.find(m => m.name === name);

      if (newMuni && oldMuni) {
        const oldIntensity = oldMuni.tourism_intensity * 100;
        const newIntensity = newMuni.tourism_intensity * 100;
        const change = newIntensity - oldIntensity;

        comparisons.push({
          name,
          oldIntensity,
          newIntensity,
          change,
          direction: change > 0 ? '📈' : change < 0 ? '📉' : '➡️'
        });
      }
    });

    comparisons.forEach(comp => {
      console.log(`  ${comp.name}: ${comp.oldIntensity.toFixed(1)}% → ${comp.newIntensity.toFixed(1)}% (${comp.change > 0 ? '+' : ''}${comp.change.toFixed(1)}) ${comp.direction}`);
    });

    // 10. GENERAR SISTEMA CON DATOS HISTÓRICOS DIRECTOS
    const finalData = {
      ...data,
      version: '17.0_direct_historical_application',
      updated_at: new Date().toISOString(),
      generation_method: 'direct_historical_occupation_application',
      description: `Aplicación directa de ocupación hotelera histórica 2006-2024 para ${currentMonth}`,

      municipalities: updatedMunicipalities,

      // Update points array
      points: updatedMunicipalities
        .filter(m => m.lat && m.lng)
        .map(m => [m.lat, m.lng, m.tourism_intensity]),

      // Direct historical metadata
      direct_historical_metadata: {
        current_month: currentMonth,
        data_period: '2006-2024',
        years_averaged: 19,
        application_method: 'direct_occupation_percentage',
        municipalities_with_data: appliedCount,
        municipalities_fallback: fallbackCount,
        category_distribution: newCategories,
        applied_at: new Date().toISOString()
      },

      // Historical occupation by zone
      zone_historical_occupations: zoneOccupations
    };

    // 11. GUARDAR SISTEMA CON DATOS HISTÓRICOS DIRECTOS
    console.log('\\n💾 Guardando sistema con datos históricos directos...');
    await writeFile('public/data/current.json', JSON.stringify(finalData, null, 2));
    await writeFile('data/direct-historical-application.json', JSON.stringify(finalData, null, 2));

    console.log('\\n✅ DATOS HISTÓRICOS APLICADOS DIRECTAMENTE');
    console.log('==========================================');
    console.log(`📊 Ocupación histórica aplicada a ${appliedCount} municipios`);
    console.log(`📅 Datos de ${currentMonth} basados en promedios 2006-2024`);
    console.log(`🎯 Sistema corregido: valores absolutos en lugar de multiplicadores`);
    console.log('📁 Archivos guardados:');
    console.log('  - public/data/current.json (DATOS HISTÓRICOS DIRECTOS)');
    console.log('  - data/direct-historical-application.json (backup)');

    return finalData;

  } catch (error) {
    console.error('❌ Error aplicando datos históricos directos:', error.message);
    throw error;
  }
}

// Ejecutar aplicación directa
applyHistoricalDataDirectly().catch(console.error);

export { applyHistoricalDataDirectly };