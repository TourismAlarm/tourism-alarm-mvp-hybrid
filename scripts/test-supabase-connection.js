/**
 * TEST: Verificar conexión a Supabase
 * ====================================
 * Verifica que las credenciales de Supabase son correctas
 * y que las tablas existen.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

console.log('🔍 Verificando configuración de Supabase...\n');

// 1. Verificar variables de entorno
if (!supabaseUrl || supabaseUrl === 'TU_SUPABASE_URL_AQUI') {
  console.error('❌ ERROR: SUPABASE_URL no configurada en .env');
  console.log('   Sigue las instrucciones en SUPABASE-SETUP.md');
  process.exit(1);
}

if (!supabaseKey || supabaseKey === 'TU_SUPABASE_ANON_KEY_AQUI') {
  console.error('❌ ERROR: SUPABASE_ANON_KEY no configurada en .env');
  console.log('   Sigue las instrucciones en SUPABASE-SETUP.md');
  process.exit(1);
}

console.log('✅ Variables de entorno configuradas');
console.log(`   URL: ${supabaseUrl.substring(0, 30)}...`);
console.log(`   Key: ${supabaseKey.substring(0, 20)}...`);
console.log('');

// 2. Crear cliente
const supabase = createClient(supabaseUrl, supabaseKey);

// 3. Verificar tablas
const tablas = [
  'municipios',
  'datos_hoteles_raw',
  'eventos_raw',
  'analisis_diario'
];

console.log('🔌 Probando conexión a Supabase...\n');

let todasOk = true;

for (const tabla of tablas) {
  try {
    const { data, error } = await supabase
      .from(tabla)
      .select('count', { count: 'exact', head: true });

    if (error) {
      console.log(`❌ Tabla "${tabla}": Error - ${error.message}`);
      todasOk = false;
    } else {
      const count = data?.length || 0;
      console.log(`✅ Tabla "${tabla}": OK`);
    }
  } catch (error) {
    console.log(`❌ Tabla "${tabla}": Error - ${error.message}`);
    todasOk = false;
  }
}

console.log('');

if (todasOk) {
  console.log('🎉 ¡Todo configurado correctamente!');
  console.log('');
  console.log('📋 Próximos pasos:');
  console.log('   1. Poblar municipios: npm run db:populate');
  console.log('   2. Ejecutar scraping: npm run agent:scraping');
  console.log('   3. Ejecutar análisis: npm run agent:analizar');
  console.log('');
} else {
  console.log('⚠️  Hay errores. Verifica:');
  console.log('   1. Las credenciales son correctas en .env');
  console.log('   2. Ejecutaste el schema.sql en Supabase');
  console.log('   3. Sigue SUPABASE-SETUP.md paso a paso');
  console.log('');
  process.exit(1);
}
