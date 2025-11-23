#!/usr/bin/env node
// 🌅 ACTUALIZACIÓN DIARIA COMPLETA
// Ejecuta todo el proceso: snapshot + generar mapa + build
// Uso: npm run daily:full

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const isWindows = process.platform === 'win32';

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔹 Ejecutando: ${command} ${args.join(' ')}`);
    console.log('-'.repeat(50));

    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: isWindows,
      cwd: process.cwd()
    });

    proc.on('close', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Comando falló con código ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

async function mergeSnapshotWithMapData() {
  console.log('\n📊 Integrando snapshot en datos del mapa...');

  try {
    // Leer snapshot más reciente
    const snapshotPath = resolve('data/daily-snapshots/latest.json');
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf-8'));

    // Leer datos actuales del mapa
    const mapDataPath = resolve('public/data/current.json');
    const mapData = JSON.parse(await readFile(mapDataPath, 'utf-8'));

    // Crear mapa de zonas a municipios
    const zoneToMunicipalities = {
      'costa_brava_norte': ['170523', '170329', '170854', '170600'], // Roses, Cadaqués, L'Escala...
      'costa_brava_centro': ['170950', '172023', '170237'], // Lloret, Tossa, Blanes
      'costa_brava_sur': ['171181', '171609', '170486'], // Palamós, Sant Feliu, Platja d'Aro
      'costa_dorada': ['439057', '430385', '431482'], // Salou, Cambrils, Tarragona
      'barcelona_ciudad': ['80193'], // Barcelona
      'barcelona_costa': ['82704', '80569'], // Sitges, Castelldefels
      'pirineos_aran': ['252430', '250254'], // Vielha, Naut Aran
      'pirineos_cerdanya': ['171411', '170062'], // Puigcerdà, Alp
      'pirineos_pallars': ['252094', '250432'], // Sort, Vall de Boí
      'interior_garrotxa': ['171143', '170195'], // Olot, Besalú (aproximado)
      'montserrat': ['81271'] // Monistrol
    };

    // Actualizar intensidades basadas en ocupación del snapshot
    let updated = 0;
    for (const [zoneId, zone] of Object.entries(snapshot.zones || {})) {
      if (zone.occupation_percentage !== null && zone.tourist_pressure !== null) {
        const municipalityIds = zoneToMunicipalities[zoneId] || [];

        for (const munId of municipalityIds) {
          const muni = mapData.municipalities?.find(m => m.id === munId);
          if (muni) {
            // Ajustar intensidad basada en presión turística real
            const baseIntensity = muni.tourism_intensity || 0.5;
            const realPressure = zone.tourist_pressure;

            // Combinar: 60% base + 40% presión real
            muni.tourism_intensity = (baseIntensity * 0.6) + (realPressure * 0.4);
            muni.last_updated = snapshot.date;
            muni.occupation_source = 'daily_snapshot';
            updated++;
          }
        }
      }
    }

    // Añadir metadata del snapshot
    mapData.metadata = mapData.metadata || {};
    mapData.metadata.last_snapshot = snapshot.date;
    mapData.metadata.snapshot_timestamp = snapshot.timestamp;
    mapData.metadata.municipalities_updated = updated;

    // Guardar
    await writeFile(mapDataPath, JSON.stringify(mapData, null, 2), 'utf-8');
    console.log(`   ✅ ${updated} municipios actualizados con datos de ocupación real`);

    return true;
  } catch (error) {
    console.log(`   ⚠️  No se pudo integrar snapshot: ${error.message}`);
    return false;
  }
}

async function dailyFullUpdate() {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];

  console.log('🌅 ACTUALIZACIÓN DIARIA COMPLETA - TOURISM ALARM');
  console.log('='.repeat(70));
  console.log(`📅 Fecha: ${today}`);
  console.log(`⏰ Hora: ${new Date().toLocaleTimeString('es-ES')}`);

  try {
    // Paso 1: Obtener snapshot de ocupación
    console.log('\n\n📍 PASO 1/4: OBTENIENDO OCUPACIÓN ACTUAL');
    console.log('='.repeat(70));
    await runCommand('node', ['agents/daily-occupation-agent.js']);

    // Paso 2: Regenerar datos del mapa
    console.log('\n\n📍 PASO 2/4: REGENERANDO DATOS DEL MAPA');
    console.log('='.repeat(70));
    await runCommand('node', ['scripts/fetch-catalunya-data.js']);

    // Paso 3: Integrar snapshot con datos del mapa
    console.log('\n\n📍 PASO 3/4: INTEGRANDO DATOS DINÁMICOS');
    console.log('='.repeat(70));
    await mergeSnapshotWithMapData();

    // Paso 4: Mostrar comparativa
    console.log('\n\n📍 PASO 4/4: COMPARATIVA HISTÓRICA');
    console.log('='.repeat(70));
    await runCommand('node', ['scripts/compare-historical.js']);

    // Resumen final
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n\n' + '='.repeat(70));
    console.log('✅ ACTUALIZACIÓN DIARIA COMPLETADA');
    console.log('='.repeat(70));
    console.log(`⏱️  Duración total: ${duration} segundos`);
    console.log(`📅 Fecha: ${today}`);

    console.log('\n📊 Archivos actualizados:');
    console.log(`   • data/daily-snapshots/${today}.json`);
    console.log(`   • data/historical-data.json`);
    console.log(`   • public/data/current.json`);

    console.log('\n💡 Próximos pasos:');
    console.log('   npm run dev     # Ver la app actualizada');
    console.log('   npm run build   # Build para producción\n');

  } catch (error) {
    console.error('\n❌ Error en actualización:', error.message);
    process.exit(1);
  }
}

// Ejecutar
dailyFullUpdate();
