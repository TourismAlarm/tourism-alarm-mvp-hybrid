-- ============================================
-- TOURISM ALARM - Esquema Base de Datos Supabase
-- ============================================
-- Versión: 2.0 (Datos RAW + Agente Razonador)
-- ============================================

-- Tabla 1: MUNICIPIOS (Estática - se rellena 1 vez)
-- ============================================
CREATE TABLE IF NOT EXISTS municipios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  codigo_ine TEXT UNIQUE, -- Código INE oficial
  poblacion INTEGER,
  plazas_hoteleras INTEGER DEFAULT 0,
  tipo TEXT, -- 'costa', 'ciudad', 'interior', 'montaña', 'esqui'
  lat DECIMAL(10, 6),
  lon DECIMAL(10, 6),
  comarca TEXT,
  provincia TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_municipios_nombre ON municipios(nombre);
CREATE INDEX IF NOT EXISTS idx_municipios_tipo ON municipios(tipo);
CREATE INDEX IF NOT EXISTS idx_municipios_provincia ON municipios(provincia);

-- ============================================
-- Tabla 2: DATOS HOTELES RAW (Datos diarios sin interpretar)
-- ============================================
CREATE TABLE IF NOT EXISTS datos_hoteles_raw (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER REFERENCES municipios(id),
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  precio_medio DECIMAL(10, 2),
  precio_minimo DECIMAL(10, 2),
  precio_maximo DECIMAL(10, 2),
  ocupacion_estimada INTEGER, -- 0-100 (basado en disponibilidad)
  num_hoteles_analizados INTEGER,
  num_hoteles_disponibles INTEGER,
  fuente TEXT, -- 'booking', 'google_hotels', 'trivago'
  datos_json JSONB, -- Datos adicionales (precios por hotel, etc.)
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_hoteles_municipio_fecha ON datos_hoteles_raw(municipio_id, fecha);
CREATE INDEX IF NOT EXISTS idx_hoteles_fecha ON datos_hoteles_raw(fecha);
CREATE INDEX IF NOT EXISTS idx_hoteles_created ON datos_hoteles_raw(created_at);

-- ============================================
-- Tabla 3: EVENTOS RAW (Eventos sin interpretar)
-- ============================================
CREATE TABLE IF NOT EXISTS eventos_raw (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER REFERENCES municipios(id),
  nombre_evento TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  tipo TEXT, -- 'festival', 'feria', 'deportivo', 'cultural', 'gastronomico'
  asistencia_estimada INTEGER,
  fuente TEXT, -- URL o nombre de la fuente
  url_evento TEXT,
  descripcion TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_eventos_municipio ON eventos_raw(municipio_id);
CREATE INDEX IF NOT EXISTS idx_eventos_fechas ON eventos_raw(fecha_inicio, fecha_fin);

-- ============================================
-- Tabla 4: ANÁLISIS DIARIO (Interpretación del agente IA)
-- ============================================
CREATE TABLE IF NOT EXISTS analisis_diario (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER REFERENCES municipios(id),
  fecha DATE NOT NULL,

  -- Puntuación y color final
  puntuacion INTEGER CHECK (puntuacion >= 0 AND puntuacion <= 100),
  color TEXT, -- 'verde', 'verde_oscuro', 'amarillo', 'naranja', 'rojo', 'rojo_critico'

  -- Razonamiento del agente IA
  razonamiento TEXT,

  -- Alertas detectadas
  alertas JSONB, -- ["Ocupación 2x superior a media", "Evento masivo"]

  -- Métricas calculadas
  ocupacion_actual INTEGER,
  ocupacion_media_mes INTEGER,
  ocupacion_media_anual INTEGER,
  desviacion_respecto_media DECIMAL(5, 2), -- Porcentaje

  -- Eventos detectados hoy
  eventos_activos INTEGER DEFAULT 0,

  -- Metadata
  version_agente TEXT, -- Para tracking de cambios en lógica
  created_at TIMESTAMP DEFAULT NOW(),

  -- Constraint: un análisis por municipio por día
  UNIQUE(municipio_id, fecha)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_analisis_municipio_fecha ON analisis_diario(municipio_id, fecha);
CREATE INDEX IF NOT EXISTS idx_analisis_fecha ON analisis_diario(fecha);
CREATE INDEX IF NOT EXISTS idx_analisis_color ON analisis_diario(color);
CREATE INDEX IF NOT EXISTS idx_analisis_puntuacion ON analisis_diario(puntuacion);

-- ============================================
-- Vista: DATOS ACTUALES (para el mapa)
-- ============================================
CREATE OR REPLACE VIEW vista_mapa_actual AS
SELECT
  m.id,
  m.nombre,
  m.lat,
  m.lon,
  m.tipo,
  m.poblacion,
  m.plazas_hoteleras,
  a.puntuacion,
  a.color,
  a.razonamiento,
  a.alertas,
  a.ocupacion_actual,
  a.eventos_activos,
  a.fecha
FROM municipios m
LEFT JOIN analisis_diario a ON m.id = a.municipio_id
WHERE a.fecha = CURRENT_DATE
ORDER BY a.puntuacion DESC;

-- ============================================
-- Vista: HISTÓRICO ÚLTIMOS 30 DÍAS
-- ============================================
CREATE OR REPLACE VIEW vista_historico_30dias AS
SELECT
  m.nombre as municipio,
  a.fecha,
  a.puntuacion,
  a.ocupacion_actual,
  a.eventos_activos
FROM analisis_diario a
JOIN municipios m ON a.municipio_id = m.id
WHERE a.fecha >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY m.nombre, a.fecha DESC;

-- ============================================
-- Función: CALCULAR MEDIA HISTÓRICA
-- ============================================
CREATE OR REPLACE FUNCTION calcular_media_historica(
  p_municipio_id INTEGER,
  p_dias INTEGER DEFAULT 30
)
RETURNS TABLE (
  media_ocupacion DECIMAL,
  media_puntuacion DECIMAL,
  desviacion_std DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    AVG(ocupacion_actual)::DECIMAL,
    AVG(puntuacion)::DECIMAL,
    STDDEV(puntuacion)::DECIMAL
  FROM analisis_diario
  WHERE municipio_id = p_municipio_id
    AND fecha >= CURRENT_DATE - (p_dias || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Función: OBTENER EVENTOS ACTIVOS HOY
-- ============================================
CREATE OR REPLACE FUNCTION eventos_activos_hoy(p_municipio_id INTEGER)
RETURNS TABLE (
  nombre_evento TEXT,
  tipo TEXT,
  asistencia_estimada INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.nombre_evento,
    e.tipo,
    e.asistencia_estimada
  FROM eventos_raw e
  WHERE e.municipio_id = p_municipio_id
    AND CURRENT_DATE BETWEEN e.fecha_inicio AND e.fecha_fin;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMENTARIOS DE TABLAS
-- ============================================
COMMENT ON TABLE municipios IS 'Catálogo estático de municipios de Catalunya con datos básicos';
COMMENT ON TABLE datos_hoteles_raw IS 'Datos RAW de scraping hotelero sin interpretar';
COMMENT ON TABLE eventos_raw IS 'Eventos y festivales sin interpretar';
COMMENT ON TABLE analisis_diario IS 'Interpretación diaria del agente IA razonador';

COMMENT ON COLUMN analisis_diario.puntuacion IS 'Puntuación final 0-100 calculada por agente IA';
COMMENT ON COLUMN analisis_diario.razonamiento IS 'Explicación textual del agente IA sobre por qué asignó esta puntuación';
COMMENT ON COLUMN analisis_diario.alertas IS 'Array JSON de alertas detectadas (ocupación anómala, eventos masivos, etc.)';
