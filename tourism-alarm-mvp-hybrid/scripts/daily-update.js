#!/usr/bin/env node
// 🌅 SCRIPT DE ACTUALIZACIÓN DIARIA
// Ejecuta todo el proceso de enriquecimiento e integración automáticamente
// Uso: npm run daily o node scripts/daily-update.js [--limit=N]

import 'dotenv/config';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

function runCommand(command, args = []) {
  return new Promise((resolve, reject) => {
    console.log(`\n🔹 Ejecutando: ${command} ${args.join(' ')}`);
    console.log('-'.repeat(50));

    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: isWindows
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

async function dailyUpdate() {
  const startTime = Date.now();

  console.log('🌅 ACTUALIZACIÓN DIARIA DE TOURISM ALARM');
  console.log('='.repeat(70));
  console.log(`📅 Fecha: ${new Date().toLocaleDateString('es-ES')}`);
  console.log(`⏰ Hora: ${new Date().toLocaleTimeString('es-ES')}`);

  // Parsear argumentos
  const args = process.argv.slice(2);
  const limitArg = args.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? limitArg.split('=')[1] : '50';

  try {
    // Paso 1: Enriquecer datos con IA
    console.log('\n\n📍 PASO 1/3: ENRIQUECIENDO DATOS CON IA');
    console.log('='.repeat(70));
    await runCommand('node', ['agents/universal-agent.js', `--limit=${limit}`]);

    // Paso 2: Integrar datos
    console.log('\n\n📍 PASO 2/3: INTEGRANDO DATOS AL PROYECTO');
    console.log('='.repeat(70));
    await runCommand('node', ['scripts/integrate-enriched-data.js']);

    // Paso 3: Regenerar datos del mapa
    console.log('\n\n📍 PASO 3/3: REGENERANDO DATOS DEL MAPA');
    console.log('='.repeat(70));
    await runCommand('node', ['scripts/generate-from-topojson.js']);

    // Resumen final
    const duration = Math.round((Date.now() - startTime) / 1000);
    console.log('\n\n' + '='.repeat(70));
    console.log('✅ ACTUALIZACIÓN DIARIA COMPLETADA');
    console.log('='.repeat(70));
    console.log(`⏱️  Duración total: ${duration} segundos`);
    console.log(`📊 Municipios procesados: ${limit}`);
    console.log('\n💡 Para ver los cambios:');
    console.log('   npm run dev');
    console.log('   Abre http://localhost:5173\n');

  } catch (error) {
    console.error('\n❌ Error en actualización:', error.message);
    process.exit(1);
  }
}

// Ejecutar
dailyUpdate();
