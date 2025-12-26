/**
 * SCRIPT: Rellenar tabla municipios en Supabase
 * ================================================
 * - Lee datos de TopoJSON con 947 municipios de Catalunya
 * - Se conecta a Supabase
 * - Inserta municipios con datos básicos
 * - Solo se ejecuta 1 VEZ (datos estáticos)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// Configuración Supabase
// ============================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Faltan credenciales de Supabase en .env');
  console.error('   Necesitas: SUPABASE_URL y SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// Mapeo de códigos de provincia
// ============================================
const provinciasMap = {
  8: 'Barcelona',
  17: 'Girona',
  25: 'Lleida',
  43: 'Tarragona'
};

// ============================================
// Mapeo de códigos de comarca (simplificado)
// ============================================
const comarcasMap = {
  1: 'Alt Camp',
  2: 'Alt Empordà',
  3: 'Alt Penedès',
  4: 'Alt Urgell',
  5: 'Alta Ribagorça',
  6: 'Anoia',
  7: 'Bages',
  8: 'Baix Camp',
  9: 'Baix Ebre',
  10: 'Baix Empordà',
  11: 'Baix Llobregat',
  12: 'Baix Penedès',
  13: 'Barcelonès',
  14: 'Berguedà',
  15: 'Cerdanya',
  16: 'Conca de Barberà',
  17: 'Garraf',
  18: 'Garrigues',
  19: 'Garrotxa',
  20: 'Gironès',
  21: 'Maresme',
  22: 'Moianès',
  23: 'Montsià',
  24: 'Osona',
  25: 'Pallars Jussà',
  26: 'Pallars Sobirà',
  27: 'Pla de l\'Estany',
  28: 'Pla de l\'Estany',
  29: 'Priorat',
  30: 'Ribera d\'Ebre',
  31: 'Ripollès',
  32: 'Segarra',
  33: 'Segrià',
  34: 'Selva',
  35: 'Solsonès',
  36: 'Tarragonès',
  37: 'Terra Alta',
  38: 'Urgell',
  39: 'Val d\'Aran',
  40: 'Vallès Occidental',
  41: 'Vallès Oriental'
};

// ============================================
// Clasificación de tipo por nombre/comarca
// ============================================
function clasificarTipo(nombre, comarca, provincia) {
  const nombreLower = nombre.toLowerCase();

  // Costa
  if (nombreLower.includes('mar') ||
      nombreLower.includes('costa') ||
      nombreLower.includes('playa') ||
      nombreLower.includes('platja') ||
      ['Lloret de Mar', 'Tossa', 'Roses', 'Cadaqués', 'Sitges', 'Salou', 'Cambrils', 'Calella'].includes(nombre)) {
    return 'costa';
  }

  // Esquí
  if (nombreLower.includes('vall de boí') ||
      nombreLower.includes('naut aran') ||
      nombreLower.includes('baqueira') ||
      comarca === 'Alta Ribagorça' ||
      comarca === 'Val d\'Aran') {
    return 'esqui';
  }

  // Montaña
  if (comarca === 'Berguedà' ||
      comarca === 'Pallars Sobirà' ||
      comarca === 'Ripollès' ||
      comarca === 'Cerdanya' ||
      nombreLower.includes('pirineu')) {
    return 'montaña';
  }

  // Ciudad grande
  if (['Barcelona', 'Tarragona', 'Lleida', 'Girona', 'Reus', 'Badalona', 'Hospitalet de Llobregat'].includes(nombre)) {
    return 'ciudad';
  }

  // Por defecto: interior
  return 'interior';
}

// ============================================
// Función principal
// ============================================
async function main() {
  console.log('🚀 Iniciando población de tabla municipios en Supabase\n');

  // 1. Leer TopoJSON
  console.log('📖 Leyendo TopoJSON...');
  const topoJsonPath = path.join(__dirname, '../tourism-alarm-mvp-hybrid/public/geojson/cat-municipis.json');

  if (!fs.existsSync(topoJsonPath)) {
    console.error('❌ No se encuentra el archivo TopoJSON:', topoJsonPath);
    process.exit(1);
  }

  const topoData = JSON.parse(fs.readFileSync(topoJsonPath, 'utf-8'));
  const municipios = topoData.objects.municipis.geometries;

  console.log(`✅ Leídos ${municipios.length} municipios del TopoJSON\n`);

  // 2. Preparar datos para Supabase
  console.log('🔄 Preparando datos para inserción...');

  const municipiosData = municipios.map(muni => {
    const provincia = provinciasMap[muni.properties.provincia] || 'Desconocida';
    const comarca = comarcasMap[muni.properties.comarca] || 'Desconocida';
    const tipo = clasificarTipo(muni.properties.nom, comarca, provincia);

    return {
      codigo_ine: muni.id.toString(),
      nombre: muni.properties.nom,
      poblacion: null, // Se rellenará con IDESCAT después
      plazas_hoteleras: 0, // Se rellenará después
      tipo: tipo,
      lat: null, // TopoJSON no tiene centroides, se calculará después
      lon: null,
      comarca: comarca,
      provincia: provincia
    };
  });

  console.log(`✅ Preparados ${municipiosData.length} municipios para insertar\n`);

  // 3. Verificar conexión a Supabase
  console.log('🔌 Verificando conexión a Supabase...');

  const { data: testData, error: testError } = await supabase
    .from('municipios')
    .select('count')
    .limit(1);

  if (testError) {
    console.error('❌ Error conectando a Supabase:', testError.message);
    console.error('   Verifica que:');
    console.error('   1. SUPABASE_URL y SUPABASE_ANON_KEY estén en .env');
    console.error('   2. La tabla "municipios" exista en Supabase');
    console.error('   3. Hayas ejecutado el schema.sql');
    process.exit(1);
  }

  console.log('✅ Conexión a Supabase OK\n');

  // 4. Verificar si ya hay datos
  const { data: existing, error: countError } = await supabase
    .from('municipios')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    console.error('❌ Error verificando datos existentes:', countError.message);
    process.exit(1);
  }

  const existingCount = existing?.length || 0;

  if (existingCount > 0) {
    console.log(`⚠️  Ya hay ${existingCount} municipios en la tabla.`);
    console.log('   ¿Quieres:');
    console.log('   1. Salir (los datos ya están)');
    console.log('   2. Borrar todo y reinsertar');
    console.log('');
    console.log('   Por seguridad, este script se detendrá aquí.');
    console.log('   Si quieres reinsertar, borra manualmente la tabla y vuelve a ejecutar.');
    process.exit(0);
  }

  // 5. Insertar en batches (Supabase tiene límite)
  console.log('💾 Insertando municipios en Supabase...');

  const BATCH_SIZE = 100;
  let insertados = 0;
  let errores = 0;

  for (let i = 0; i < municipiosData.length; i += BATCH_SIZE) {
    const batch = municipiosData.slice(i, i + BATCH_SIZE);

    const { data, error } = await supabase
      .from('municipios')
      .insert(batch)
      .select();

    if (error) {
      console.error(`❌ Error insertando batch ${i}-${i + batch.length}:`, error.message);
      errores += batch.length;
    } else {
      insertados += data.length;
      process.stdout.write(`   Insertados: ${insertados}/${municipiosData.length}\r`);
    }
  }

  console.log(`\n✅ Proceso completado!`);
  console.log(`   - Municipios insertados: ${insertados}`);
  console.log(`   - Errores: ${errores}`);
  console.log('');

  // 6. Mostrar estadísticas
  const { data: stats } = await supabase
    .from('municipios')
    .select('tipo')
    .order('tipo');

  if (stats) {
    const tipoCounts = stats.reduce((acc, m) => {
      acc[m.tipo] = (acc[m.tipo] || 0) + 1;
      return acc;
    }, {});

    console.log('📊 Distribución por tipo:');
    Object.entries(tipoCounts).forEach(([tipo, count]) => {
      console.log(`   ${tipo}: ${count}`);
    });
  }

  console.log('');
  console.log('🎯 Próximos pasos:');
  console.log('   1. Enriquecer con datos de población (IDESCAT)');
  console.log('   2. Añadir plazas hoteleras');
  console.log('   3. Calcular centroides (lat/lon)');
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
