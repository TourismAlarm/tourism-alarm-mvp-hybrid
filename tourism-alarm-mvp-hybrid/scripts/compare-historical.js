#!/usr/bin/env node
// 📊 COMPARADOR HISTÓRICO ANUAL
// Compara los datos actuales con el mismo período del año anterior

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

async function compareHistorical() {
  console.log('📊 COMPARACIÓN HISTÓRICA ANUAL\n');
  console.log('='.repeat(70));

  const today = new Date();
  const currentYear = today.getFullYear();
  const lastYear = currentYear - 1;
  const currentDate = today.toISOString().split('T')[0];

  // Fecha equivalente del año pasado
  const lastYearDate = `${lastYear}${currentDate.slice(4)}`;

  console.log(`\n📅 Comparando:`);
  console.log(`   • Hoy: ${currentDate}`);
  console.log(`   • Año pasado: ${lastYearDate}`);

  try {
    // Cargar datos históricos
    const historicalPath = resolve('data/historical-data.json');
    const historical = JSON.parse(await readFile(historicalPath, 'utf-8'));

    // Buscar datos de este año
    const thisYearData = historical.years[currentYear]?.snapshots || [];
    const lastYearData = historical.years[lastYear]?.snapshots || [];

    if (thisYearData.length === 0) {
      console.log('\n⚠️  No hay datos de este año todavía');
      console.log('   Ejecuta: npm run daily:snapshot\n');
      return;
    }

    // Obtener último snapshot de este año
    const latestSnapshot = thisYearData[thisYearData.length - 1];

    // Buscar fecha equivalente del año pasado (o la más cercana)
    let lastYearSnapshot = lastYearData.find(s => s.date === lastYearDate);

    if (!lastYearSnapshot) {
      // Buscar la más cercana
      const targetDay = parseInt(lastYearDate.slice(8));
      const targetMonth = parseInt(lastYearDate.slice(5, 7));

      lastYearSnapshot = lastYearData.find(s => {
        const month = parseInt(s.date.slice(5, 7));
        const day = parseInt(s.date.slice(8));
        return month === targetMonth && Math.abs(day - targetDay) <= 7;
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log('📈 COMPARATIVA\n');

    console.log(`📊 Este año (${latestSnapshot.date}):`);
    console.log(`   • Ocupación media: ${latestSnapshot.avg_occupation}%`);
    console.log(`   • Presión turística: ${(latestSnapshot.avg_pressure * 100).toFixed(0)}%`);

    if (lastYearSnapshot) {
      console.log(`\n📊 Año pasado (${lastYearSnapshot.date}):`);
      console.log(`   • Ocupación media: ${lastYearSnapshot.avg_occupation}%`);
      console.log(`   • Presión turística: ${(lastYearSnapshot.avg_pressure * 100).toFixed(0)}%`);

      // Calcular diferencias
      const occupationDiff = latestSnapshot.avg_occupation - lastYearSnapshot.avg_occupation;
      const pressureDiff = latestSnapshot.avg_pressure - lastYearSnapshot.avg_pressure;

      console.log('\n📊 Diferencia:');

      const occupationEmoji = occupationDiff > 0 ? '📈' : (occupationDiff < 0 ? '📉' : '➡️');
      const pressureEmoji = pressureDiff > 0 ? '📈' : (pressureDiff < 0 ? '📉' : '➡️');

      console.log(`   ${occupationEmoji} Ocupación: ${occupationDiff > 0 ? '+' : ''}${occupationDiff}%`);
      console.log(`   ${pressureEmoji} Presión: ${pressureDiff > 0 ? '+' : ''}${(pressureDiff * 100).toFixed(0)}%`);

      // Interpretación
      console.log('\n💡 Interpretación:');
      if (occupationDiff > 10) {
        console.log('   ⚠️  La ocupación es significativamente mayor que el año pasado');
      } else if (occupationDiff < -10) {
        console.log('   ✅ La ocupación es menor que el año pasado');
      } else {
        console.log('   ➡️  La ocupación es similar al año pasado');
      }
    } else {
      console.log('\n⚠️  No hay datos del año pasado para comparar');
      console.log('   Los datos se irán acumulando para futuras comparaciones');
    }

    // Mostrar tendencia del mes actual
    const currentMonth = currentDate.slice(0, 7);
    const monthSnapshots = thisYearData.filter(s => s.date.startsWith(currentMonth));

    if (monthSnapshots.length > 1) {
      console.log(`\n📅 Tendencia del mes (${monthSnapshots.length} días):`);

      const firstDay = monthSnapshots[0];
      const lastDay = monthSnapshots[monthSnapshots.length - 1];
      const monthTrend = lastDay.avg_occupation - firstDay.avg_occupation;

      const trendEmoji = monthTrend > 5 ? '📈' : (monthTrend < -5 ? '📉' : '➡️');
      console.log(`   ${trendEmoji} Ocupación: ${firstDay.avg_occupation}% → ${lastDay.avg_occupation}%`);
    }

  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('\n⚠️  No hay datos históricos todavía');
      console.log('   Ejecuta: npm run daily:snapshot');
      console.log('   Los datos se irán acumulando automáticamente\n');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

compareHistorical().catch(console.error);
