/**
 * AGENTE: Scraping de Booking.com (Datos RAW)
 * ============================================
 * - Busca precios de hoteles para municipios turísticos
 * - Guarda datos RAW sin interpretar en Supabase
 * - Se ejecuta cada 12 horas (GitHub Actions)
 *
 * IMPORTANTE: Versión 1.0 usa datos simulados REALISTAS
 * TODO: Reemplazar con scraping real de Booking.com
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// ============================================
// Configuración
// ============================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Faltan credenciales de Supabase en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ============================================
// Configuración del scraper
// ============================================
const CONFIG = {
  // Solo municipios con turismo significativo
  MIN_PLAZAS_HOTELERAS: 100,

  // Número de hoteles a analizar por municipio
  HOTELES_POR_MUNICIPIO: 20,

  // Delay entre peticiones (para no saturar)
  DELAY_MS: 1000,
};

// ============================================
// FUNCIÓN: Calcular temporada
// ============================================
function calcularTemporada() {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1; // 1-12

  // Verano (junio-septiembre): temporada alta
  if (mes >= 6 && mes <= 9) {
    return { nombre: 'verano', factor: 1.3 };
  }

  // Invierno (diciembre-febrero): temporada esquí
  if (mes === 12 || mes <= 2) {
    return { nombre: 'invierno', factor: 1.2 };
  }

  // Primavera/Otoño: temporada media
  return { nombre: 'media', factor: 1.0 };
}

// ============================================
// FUNCIÓN: Calcular precio base según tipo
// ============================================
function calcularPrecioBase(tipo) {
  const preciosBase = {
    'ciudad': 120,      // Barcelona, Girona
    'costa': 95,        // Lloret, Sitges
    'esqui': 110,       // Baqueira
    'montaña': 75,      // Ripoll
    'interior': 60      // Municipios pequeños
  };

  return preciosBase[tipo] || 70;
}

// ============================================
// FUNCIÓN: Simular scraping de Booking
// (TODO: Reemplazar con scraping REAL)
// ============================================
async function scrapearHotelesSimulado(municipio) {
  const temporada = calcularTemporada();
  const precioBase = calcularPrecioBase(municipio.tipo);

  // Aplicar factor de temporada
  let precioMedio = precioBase * temporada.factor;

  // Ajuste por tipo de municipio en temporada
  if (municipio.tipo === 'esqui' && temporada.nombre === 'invierno') {
    precioMedio *= 1.5; // Esquí en invierno: muy caro
  }

  if (municipio.tipo === 'costa' && temporada.nombre === 'invierno') {
    precioMedio *= 0.5; // Costa en invierno: muy barato
  }

  // Añadir variación aleatoria ±20%
  const variacion = 0.8 + Math.random() * 0.4;
  precioMedio *= variacion;

  // Calcular ocupación basada en precio
  // Precio alto = ocupación alta
  let ocupacion = 50; // Base 50%

  if (precioMedio > precioBase * 1.2) {
    ocupacion = 70 + Math.random() * 20; // 70-90%
  } else if (precioMedio < precioBase * 0.8) {
    ocupacion = 20 + Math.random() * 20; // 20-40%
  } else {
    ocupacion = 45 + Math.random() * 20; // 45-65%
  }

  // Simular precios min/max
  const precioMin = precioMedio * 0.7;
  const precioMax = precioMedio * 1.4;

  // Simular disponibilidad
  const totalHoteles = Math.min(
    CONFIG.HOTELES_POR_MUNICIPIO,
    Math.floor((municipio.plazas_hoteleras || 100) / 50)
  );
  const hotelesDisponibles = Math.floor(totalHoteles * (1 - ocupacion / 100));

  return {
    precio_medio: Math.round(precioMedio * 100) / 100,
    precio_minimo: Math.round(precioMin * 100) / 100,
    precio_maximo: Math.round(precioMax * 100) / 100,
    ocupacion_estimada: Math.round(ocupacion),
    num_hoteles_analizados: totalHoteles,
    num_hoteles_disponibles: hotelesDisponibles,
    fuente: 'simulado_v1', // TODO: cambiar a 'booking' cuando sea real
    datos_json: {
      temporada: temporada.nombre,
      tipo_municipio: municipio.tipo,
      nota: 'Datos simulados basados en lógica realista'
    }
  };
}

// ============================================
// FUNCIÓN: Scraping REAL de Booking.com
// (Desactivada por ahora)
// ============================================
async function scrapearHotelesReal(municipio) {
  // TODO: Implementar scraping real
  //
  // Opciones:
  // 1. Puppeteer (automatiza navegador)
  // 2. Cheerio (parsea HTML)
  // 3. API no oficial de Booking
  // 4. Servicio de pago (ScraperAPI, Apify)
  //
  // Ejemplo con Puppeteer:
  // const browser = await puppeteer.launch();
  // const page = await browser.newPage();
  // await page.goto(`https://booking.com/search?ss=${municipio.nombre}`);
  // const precios = await page.$$eval('.price', els => els.map(el => el.textContent));
  // ...

  throw new Error('Scraping real no implementado todavía');
}

// ============================================
// FUNCIÓN: Procesar un municipio
// ============================================
async function procesarMunicipio(municipio) {
  const ahora = new Date();
  const fecha = ahora.toISOString().split('T')[0];
  const hora = ahora.toTimeString().split(' ')[0];

  try {
    // Scrapear datos (por ahora simulados)
    const datosHoteles = await scrapearHotelesSimulado(municipio);

    // Guardar en Supabase (tabla datos_hoteles_raw)
    const { data, error } = await supabase
      .from('datos_hoteles_raw')
      .insert({
        municipio_id: municipio.id,
        fecha: fecha,
        hora: hora,
        ...datosHoteles
      })
      .select();

    if (error) {
      throw new Error(`Error guardando en Supabase: ${error.message}`);
    }

    return {
      success: true,
      municipio: municipio.nombre,
      ocupacion: datosHoteles.ocupacion_estimada,
      precio: datosHoteles.precio_medio
    };

  } catch (error) {
    console.error(`   ❌ Error procesando ${municipio.nombre}:`, error.message);
    return {
      success: false,
      municipio: municipio.nombre,
      error: error.message
    };
  }
}

// ============================================
// FUNCIÓN: Sleep (para delays)
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================
async function main() {
  console.log('🏨 AGENTE SCRAPING BOOKING - Iniciando\n');
  console.log(`⏰ Fecha/Hora: ${new Date().toLocaleString('es-ES')}\n`);

  // 1. Obtener municipios turísticos de Supabase
  console.log('📋 Obteniendo municipios turísticos...');

  const { data: municipios, error } = await supabase
    .from('municipios')
    .select('id, nombre, tipo, plazas_hoteleras, provincia')
    .gte('plazas_hoteleras', CONFIG.MIN_PLAZAS_HOTELERAS)
    .order('plazas_hoteleras', { ascending: false });

  if (error) {
    console.error('❌ Error obteniendo municipios:', error.message);
    process.exit(1);
  }

  if (!municipios || municipios.length === 0) {
    console.log('⚠️  No hay municipios con plazas hoteleras suficientes.');
    console.log('   Ejecuta primero: npm run db:populate');
    process.exit(0);
  }

  console.log(`✅ Encontrados ${municipios.length} municipios turísticos\n`);

  // Mostrar top 10
  console.log('🔝 Top 10 municipios por plazas hoteleras:');
  municipios.slice(0, 10).forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.nombre} (${m.plazas_hoteleras} plazas)`);
  });
  console.log('');

  // 2. Procesar cada municipio
  console.log('🔄 Iniciando scraping de hoteles...\n');

  const resultados = {
    total: municipios.length,
    exitosos: 0,
    fallidos: 0,
    ocupacion_media: 0,
    precio_medio: 0
  };

  const ocupaciones = [];
  const precios = [];

  for (let i = 0; i < municipios.length; i++) {
    const municipio = municipios[i];

    process.stdout.write(
      `   [${i + 1}/${municipios.length}] ${municipio.nombre.padEnd(30)} ... `
    );

    const resultado = await procesarMunicipio(municipio);

    if (resultado.success) {
      console.log(`✅ ${resultado.ocupacion}% (${resultado.precio}€)`);
      resultados.exitosos++;
      ocupaciones.push(resultado.ocupacion);
      precios.push(resultado.precio);
    } else {
      console.log(`❌ Error`);
      resultados.fallidos++;
    }

    // Delay para no saturar (solo si hay más municipios)
    if (i < municipios.length - 1) {
      await sleep(CONFIG.DELAY_MS);
    }
  }

  // 3. Calcular estadísticas
  if (ocupaciones.length > 0) {
    resultados.ocupacion_media = Math.round(
      ocupaciones.reduce((a, b) => a + b, 0) / ocupaciones.length
    );
    resultados.precio_medio = Math.round(
      (precios.reduce((a, b) => a + b, 0) / precios.length) * 100
    ) / 100;
  }

  // 4. Resumen final
  console.log('\n');
  console.log('=' .repeat(50));
  console.log('📊 RESUMEN DEL SCRAPING');
  console.log('=' .repeat(50));
  console.log(`✅ Exitosos:         ${resultados.exitosos}/${resultados.total}`);
  console.log(`❌ Fallidos:         ${resultados.fallidos}/${resultados.total}`);
  console.log(`📈 Ocupación media:  ${resultados.ocupacion_media}%`);
  console.log(`💰 Precio medio:     ${resultados.precio_medio}€`);
  console.log('=' .repeat(50));
  console.log('');

  console.log('🎯 Próximo paso: Ejecutar agente razonador');
  console.log('   npm run agent:analizar');
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
