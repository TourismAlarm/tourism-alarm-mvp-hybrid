/**
 * AGENTE RAZONADOR: Interpreta datos RAW con IA
 * ==============================================
 * - Lee datos RAW de hoteles y eventos de Supabase
 * - Lee histórico de los últimos 30 días
 * - Usa Gemini para RAZONAR (no inventar) la puntuación
 * - Guarda interpretación en analisis_diario
 *
 * DIFERENCIA CLAVE: Este agente NO inventa datos, solo INTERPRETA
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

// ============================================
// Configuración
// ============================================
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const geminiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ ERROR: Faltan credenciales de Supabase en .env');
  process.exit(1);
}

if (!geminiKey) {
  console.error('❌ ERROR: Falta GEMINI_API_KEY en .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

// Versión del agente (para tracking)
const VERSION_AGENTE = 'v1.0-gemini-2.0';

// ============================================
// ESCALA DE COLORES (mejorada según feedback)
// ============================================
const ESCALA_COLORES = [
  { min: 0, max: 20, color: 'verde_oscuro', nombre: 'MUY BAJO' },
  { min: 21, max: 40, color: 'verde', nombre: 'BAJO' },
  { min: 41, max: 60, color: 'amarillo', nombre: 'MEDIO' },
  { min: 61, max: 75, color: 'naranja', nombre: 'ALTO' },
  { min: 76, max: 90, color: 'rojo', nombre: 'MUY ALTO' },
  { min: 91, max: 100, color: 'rojo_critico', nombre: 'CRÍTICO' }
];

function asignarColor(puntuacion) {
  const escala = ESCALA_COLORES.find(e => puntuacion >= e.min && puntuacion <= e.max);
  return escala || ESCALA_COLORES[2]; // Default: amarillo
}

// ============================================
// FUNCIÓN: Obtener datos de hoy del municipio
// ============================================
async function obtenerDatosHoy(municipioId) {
  const hoy = new Date().toISOString().split('T')[0];

  // Datos de hoteles de hoy
  const { data: hoteles, error: errorHoteles } = await supabase
    .from('datos_hoteles_raw')
    .select('*')
    .eq('municipio_id', municipioId)
    .eq('fecha', hoy)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (errorHoteles) {
    return { hoteles: null, eventos: [] };
  }

  // Eventos activos hoy
  const { data: eventos, error: errorEventos } = await supabase
    .from('eventos_raw')
    .select('*')
    .eq('municipio_id', municipioId)
    .lte('fecha_inicio', hoy)
    .gte('fecha_fin', hoy);

  return {
    hoteles,
    eventos: eventos || []
  };
}

// ============================================
// FUNCIÓN: Obtener histórico del municipio
// ============================================
async function obtenerHistorico(municipioId, dias = 30) {
  const fechaInicio = new Date();
  fechaInicio.setDate(fechaInicio.getDate() - dias);

  const { data, error } = await supabase
    .from('datos_hoteles_raw')
    .select('fecha, ocupacion_estimada, precio_medio')
    .eq('municipio_id', municipioId)
    .gte('fecha', fechaInicio.toISOString().split('T')[0])
    .order('fecha', { ascending: false });

  if (error || !data || data.length === 0) {
    return {
      ocupacion_media: null,
      precio_medio: null,
      desviacion_std: null,
      dias_datos: 0
    };
  }

  const ocupaciones = data.map(d => d.ocupacion_estimada).filter(o => o != null);
  const precios = data.map(d => d.precio_medio).filter(p => p != null);

  const mediaOcupacion = ocupaciones.reduce((a, b) => a + b, 0) / ocupaciones.length;
  const mediaPrecio = precios.reduce((a, b) => a + b, 0) / precios.length;

  // Desviación estándar de ocupación
  const varianza = ocupaciones.reduce((acc, val) => {
    return acc + Math.pow(val - mediaOcupacion, 2);
  }, 0) / ocupaciones.length;
  const desviacion = Math.sqrt(varianza);

  return {
    ocupacion_media: Math.round(mediaOcupacion),
    precio_medio: Math.round(mediaPrecio * 100) / 100,
    desviacion_std: Math.round(desviacion * 100) / 100,
    dias_datos: data.length
  };
}

// ============================================
// FUNCIÓN: Generar prompt para Gemini
// ============================================
function generarPrompt(municipio, datosHoy, historico) {
  const hoy = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return `Eres un analista de turismo experto en Catalunya. Tu trabajo es INTERPRETAR datos reales (NO inventarlos).

**MUNICIPIO:** ${municipio.nombre}
**FECHA:** ${hoy}

**CARACTERÍSTICAS DEL MUNICIPIO:**
- Población: ${municipio.poblacion?.toLocaleString() || 'desconocida'}
- Plazas hoteleras: ${municipio.plazas_hoteleras?.toLocaleString() || 'desconocidas'}
- Tipo: ${municipio.tipo}
- Provincia: ${municipio.provincia}
- Comarca: ${municipio.comarca}

**DATOS DE HOY (REALES):**
${datosHoy.hoteles ? `
- Ocupación hotelera: ${datosHoy.hoteles.ocupacion_estimada}%
- Precio medio hoteles: ${datosHoy.hoteles.precio_medio}€
- Precio mínimo: ${datosHoy.hoteles.precio_minimo}€
- Precio máximo: ${datosHoy.hoteles.precio_maximo}€
- Hoteles analizados: ${datosHoy.hoteles.num_hoteles_analizados}
- Hoteles disponibles: ${datosHoy.hoteles.num_hoteles_disponibles}
` : '- NO HAY DATOS DE HOTELES HOY'}

**EVENTOS ACTIVOS HOY:**
${datosHoy.eventos.length > 0 ? datosHoy.eventos.map(e => `
- "${e.nombre_evento}" (${e.tipo})
  Asistencia estimada: ${e.asistencia_estimada?.toLocaleString() || 'desconocida'}
  Fechas: ${e.fecha_inicio} al ${e.fecha_fin}
`).join('\n') : '- No hay eventos registrados hoy'}

**DATOS HISTÓRICOS (últimos ${historico.dias_datos} días):**
${historico.ocupacion_media != null ? `
- Ocupación media: ${historico.ocupacion_media}%
- Precio medio: ${historico.precio_medio}€
- Desviación estándar: ${historico.desviacion_std}%
` : '- NO HAY DATOS HISTÓRICOS SUFICIENTES'}

---

**TU TAREA:**

Analiza SOLO estos datos reales y asigna una puntuación de saturación turística (0-100):

**ESCALA:**
- 0-20: MUY BAJO (municipio vacío, crisis turística)
- 21-40: BAJO (temporada baja normal)
- 41-60: MEDIO (ocupación normal)
- 61-75: ALTO (mucha gente, pero manejable)
- 76-90: MUY ALTO (saturado, pocos hoteles libres)
- 91-100: CRÍTICO (completo, precios desorbitados)

**CONSIDERA:**
1. ¿La ocupación de HOY es normal para este municipio o es anómala?
2. ¿Cómo se compara con su media histórica?
3. ¿Los eventos justifican cambios en ocupación/precios?
4. ¿El ratio visitantes/población es preocupante?
5. ¿Los precios están desorbitados o normales para el municipio?

**IMPORTANTE:**
- Si NO hay datos de hoteles hoy, asigna puntuación baja (20-30) y explica que faltan datos
- Si NO hay histórico, sé conservador en la puntuación
- NO inventes datos que no te he dado
- Basa tu razonamiento SOLO en los datos reales proporcionados

**RESPONDE EN JSON:**
\`\`\`json
{
  "puntuacion": 0-100,
  "razonamiento": "Explicación detallada de por qué asignas esta puntuación, mencionando datos específicos",
  "alertas": ["alerta1", "alerta2"] // Solo si detectas anomalías importantes
}
\`\`\`

**SOLO responde con el JSON, sin texto adicional.**`;
}

// ============================================
// FUNCIÓN: Razonar con Gemini
// ============================================
async function razonarConIA(municipio, datosHoy, historico) {
  try {
    const prompt = generarPrompt(municipio, datosHoy, historico);

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Parsear JSON (limpiar markdown si existe)
    let jsonText = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();

    const analisis = JSON.parse(jsonText);

    // Validar puntuación
    if (analisis.puntuacion < 0 || analisis.puntuacion > 100) {
      throw new Error('Puntuación fuera de rango');
    }

    return {
      puntuacion: Math.round(analisis.puntuacion),
      razonamiento: analisis.razonamiento,
      alertas: analisis.alertas || []
    };

  } catch (error) {
    console.error(`      ⚠️  Error en IA:`, error.message);

    // Fallback: usar solo datos de ocupación
    const ocupacion = datosHoy.hoteles?.ocupacion_estimada || 30;
    return {
      puntuacion: Math.round(ocupacion * 0.7), // 70% del valor de ocupación
      razonamiento: `Análisis básico por error en IA. Ocupación: ${ocupacion}%. ${error.message}`,
      alertas: ['Error en análisis IA, usando fallback']
    };
  }
}

// ============================================
// FUNCIÓN: Analizar un municipio
// ============================================
async function analizarMunicipio(municipio) {
  const hoy = new Date().toISOString().split('T')[0];

  try {
    // 1. Obtener datos de hoy
    const datosHoy = await obtenerDatosHoy(municipio.id);

    if (!datosHoy.hoteles) {
      console.log('      ⚠️  Sin datos de hoteles');
      return {
        success: false,
        razon: 'Sin datos de hoteles hoy'
      };
    }

    // 2. Obtener histórico
    const historico = await obtenerHistorico(municipio.id, 30);

    // 3. Razonar con IA
    const analisis = await razonarConIA(municipio, datosHoy, historico);

    // 4. Asignar color
    const { color } = asignarColor(analisis.puntuacion);

    // 5. Guardar en Supabase
    const { data, error } = await supabase
      .from('analisis_diario')
      .upsert({
        municipio_id: municipio.id,
        fecha: hoy,
        puntuacion: analisis.puntuacion,
        color: color,
        razonamiento: analisis.razonamiento,
        alertas: analisis.alertas,
        ocupacion_actual: datosHoy.hoteles.ocupacion_estimada,
        ocupacion_media_mes: historico.ocupacion_media,
        ocupacion_media_anual: historico.ocupacion_media, // TODO: calcular anual separado
        desviacion_respecto_media: historico.ocupacion_media
          ? Math.round(((datosHoy.hoteles.ocupacion_estimada - historico.ocupacion_media) / historico.ocupacion_media) * 100)
          : 0,
        eventos_activos: datosHoy.eventos.length,
        version_agente: VERSION_AGENTE
      }, {
        onConflict: 'municipio_id,fecha'
      })
      .select();

    if (error) {
      throw new Error(`Error guardando: ${error.message}`);
    }

    return {
      success: true,
      puntuacion: analisis.puntuacion,
      color: color,
      ocupacion: datosHoy.hoteles.ocupacion_estimada,
      eventos: datosHoy.eventos.length
    };

  } catch (error) {
    console.error(`      ❌ Error:`, error.message);
    return {
      success: false,
      razon: error.message
    };
  }
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================
async function main() {
  console.log('🧠 AGENTE RAZONADOR - Iniciando\n');
  console.log(`⏰ Fecha/Hora: ${new Date().toLocaleString('es-ES')}\n`);

  // 1. Obtener municipios con datos de hoy
  const hoy = new Date().toISOString().split('T')[0];

  console.log('📋 Obteniendo municipios con datos de hoy...');

  const { data: datosHoy, error: errorDatos } = await supabase
    .from('datos_hoteles_raw')
    .select('municipio_id')
    .eq('fecha', hoy);

  if (errorDatos) {
    console.error('❌ Error obteniendo datos:', errorDatos.message);
    process.exit(1);
  }

  if (!datosHoy || datosHoy.length === 0) {
    console.log('⚠️  No hay datos de hoteles para hoy.');
    console.log('   Ejecuta primero: npm run agent:scraping');
    process.exit(0);
  }

  const municipioIds = [...new Set(datosHoy.map(d => d.municipio_id))];

  console.log(`✅ Encontrados ${municipioIds.length} municipios con datos\n`);

  // 2. Obtener info completa de municipios
  const { data: municipios, error: errorMunicipios } = await supabase
    .from('municipios')
    .select('*')
    .in('id', municipioIds);

  if (errorMunicipios || !municipios) {
    console.error('❌ Error obteniendo municipios:', errorMunicipios?.message);
    process.exit(1);
  }

  // 3. Analizar cada municipio
  console.log('🔄 Analizando municipios con IA...\n');

  const resultados = {
    total: municipios.length,
    exitosos: 0,
    fallidos: 0,
    por_color: {}
  };

  for (let i = 0; i < municipios.length; i++) {
    const municipio = municipios[i];

    process.stdout.write(
      `   [${i + 1}/${municipios.length}] ${municipio.nombre.padEnd(30)} ... `
    );

    const resultado = await analizarMunicipio(municipio);

    if (resultado.success) {
      console.log(`✅ ${resultado.puntuacion}pts (${resultado.color}) - ${resultado.ocupacion}%`);
      resultados.exitosos++;
      resultados.por_color[resultado.color] = (resultados.por_color[resultado.color] || 0) + 1;
    } else {
      console.log(`⚠️  ${resultado.razon}`);
      resultados.fallidos++;
    }

    // Pequeño delay para no saturar Gemini
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // 4. Resumen
  console.log('\n');
  console.log('='.repeat(50));
  console.log('📊 RESUMEN DEL ANÁLISIS');
  console.log('='.repeat(50));
  console.log(`✅ Exitosos:  ${resultados.exitosos}/${resultados.total}`);
  console.log(`⚠️  Fallidos:  ${resultados.fallidos}/${resultados.total}`);
  console.log('');
  console.log('🎨 Distribución por color:');
  Object.entries(resultados.por_color).forEach(([color, count]) => {
    const emoji = {
      'verde_oscuro': '🟢',
      'verde': '🟢',
      'amarillo': '🟡',
      'naranja': '🟠',
      'rojo': '🔴',
      'rojo_critico': '🔴'
    }[color] || '⚪';
    console.log(`   ${emoji} ${color.padEnd(15)}: ${count}`);
  });
  console.log('='.repeat(50));
  console.log('');

  console.log('🎯 Los datos están listos en Supabase');
  console.log('   Tu mapa puede leer de: vista_mapa_actual');
}

// Ejecutar
main().catch(error => {
  console.error('❌ Error fatal:', error);
  process.exit(1);
});
