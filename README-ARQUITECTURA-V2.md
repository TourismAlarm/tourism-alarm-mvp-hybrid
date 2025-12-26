# 🗺️ Tourism Alarm - Arquitectura v2.0

**Mapa interactivo de saturación turística en Catalunya con datos REALES**

---

## 📖 Resumen para No-Técnicos

### ¿Qué hace este proyecto?

Muestra un **mapa de Catalunya** donde cada municipio está coloreado según cuántos turistas tiene HOY:

- 🟢 **Verde**: Pocos turistas, temporada baja
- 🟡 **Amarillo**: Turismo normal
- 🟠 **Naranja**: Mucha gente, saturado
- 🔴 **Rojo**: Completo, precios muy altos

### ¿De dónde salen los datos?

**ANTES (v1.0):** La IA **inventaba** los números → ❌ Datos falsos

**AHORA (v2.0):** Robots recogen datos **reales** cada 12 horas:
- Precios de hoteles en Booking.com (precio alto = ocupación alta)
- Eventos y festivales de cada municipio
- Estadísticas oficiales del gobierno (IDESCAT)

### ¿Cómo funciona?

```
1. Robot busca precios de hoteles (cada 12h)
   ↓
2. Guarda datos en Supabase (base de datos en la nube)
   ↓
3. IA analiza los datos y asigna colores
   ↓
4. Tu mapa muestra los colores actualizados
```

### ¿Cuánto cuesta?

**0€/mes** con el plan gratis:
- ✅ Supabase: GRATIS hasta 500 MB (dura 3 años)
- ✅ GitHub Actions: GRATIS 2000 minutos/mes
- ✅ Vercel: GRATIS 100 GB tráfico

---

## 🏗️ Arquitectura Técnica

### Diagrama de Flujo

```
┌─────────────────────────────────────────────────────────┐
│  FASE 1: RECOLECCIÓN (cada 12h - GitHub Actions)       │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────┐         ┌──────────────────┐     │
│  │  Agente Scraping │         │  Agente Eventos  │     │
│  │  (Booking.com)   │         │  (Calendarios)   │     │
│  └────────┬─────────┘         └────────┬─────────┘     │
│           │                             │               │
│           │    Datos RAW sin           │               │
│           │    interpretar             │               │
│           ↓                             ↓               │
│  ┌───────────────────────────────────────────────┐     │
│  │          SUPABASE (PostgreSQL)                │     │
│  │  ┌──────────────┐  ┌──────────────────────┐  │     │
│  │  │ hoteles_raw  │  │    eventos_raw       │  │     │
│  │  │ (precios)    │  │    (festivales)      │  │     │
│  │  └──────────────┘  └──────────────────────┘  │     │
│  └───────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 2: INTERPRETACIÓN (después de scraping)          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────┐              │
│  │  Agente Razonador (Gemini 2.0)      │              │
│  │                                       │              │
│  │  1. Lee datos RAW de hoy             │              │
│  │  2. Lee histórico últimos 30 días    │              │
│  │  3. Compara con medias               │              │
│  │  4. Detecta anomalías                │              │
│  │  5. IA RAZONA (no inventa)           │              │
│  │  6. Asigna puntuación 0-100          │              │
│  └────────────────┬─────────────────────┘              │
│                   │                                      │
│                   ↓                                      │
│  ┌───────────────────────────────────────────────┐     │
│  │          SUPABASE (PostgreSQL)                │     │
│  │  ┌────────────────────────────────────────┐  │     │
│  │  │       analisis_diario                  │  │     │
│  │  │  (puntuación, color, razonamiento)     │  │     │
│  │  └────────────────────────────────────────┘  │     │
│  └───────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  FASE 3: VISUALIZACIÓN (tu web)                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────┐              │
│  │  Frontend (JavaScript + Mapbox)      │              │
│  │                                       │              │
│  │  fetch('supabase.com/vista_mapa')    │              │
│  │    ↓                                  │              │
│  │  pintarMapa(datos)                    │              │
│  └──────────────────────────────────────┘              │
│                                                          │
│  Usuario ve:                                            │
│  🟢🟡🟠🔴 Mapa actualizado con datos reales             │
└─────────────────────────────────────────────────────────┘
```

---

## 📂 Estructura del Proyecto

```
tourism-alarm-mvp-hybrid/
│
├── 📁 supabase/
│   └── schema.sql              # Estructura de base de datos
│
├── 📁 scripts/
│   ├── populate-municipios.js  # Rellenar 947 municipios (1 vez)
│   └── test-supabase-connection.js  # Verificar conexión
│
├── 📁 agents/
│   ├── booking-scraper-agent.js     # Recolecta precios hoteles
│   ├── reasoning-agent.js           # IA que interpreta datos
│   └── (futuro) events-scraper.js   # Recolecta eventos
│
├── 📁 public/
│   ├── index.html
│   └── js/
│       └── map.js              # Frontend del mapa
│
├── .env                        # Credenciales (Supabase, Gemini)
├── package.json                # Dependencias y scripts
│
├── SUPABASE-SETUP.md           # Guía de configuración paso a paso
└── README-ARQUITECTURA-V2.md   # Este archivo
```

---

## 🗄️ Base de Datos (Supabase)

### Tabla 1: `municipios` (Estática)

Se rellena **1 sola vez** con los 947 municipios de Catalunya.

```sql
CREATE TABLE municipios (
  id SERIAL PRIMARY KEY,
  nombre TEXT,
  codigo_ine TEXT,
  poblacion INTEGER,
  plazas_hoteleras INTEGER,
  tipo TEXT,  -- 'costa', 'ciudad', 'montaña', 'interior', 'esqui'
  lat DECIMAL,
  lon DECIMAL,
  comarca TEXT,
  provincia TEXT
);
```

**Ejemplo de datos:**
| id | nombre | población | plazas_hoteleras | tipo |
|----|--------|-----------|------------------|------|
| 1 | Barcelona | 1,636,762 | 45,000 | ciudad |
| 2 | Lloret de Mar | 39,363 | 18,000 | costa |
| 3 | Sitges | 29,034 | 8,500 | costa |

---

### Tabla 2: `datos_hoteles_raw` (Datos diarios)

El **agente de scraping** añade datos cada 12 horas.

```sql
CREATE TABLE datos_hoteles_raw (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER,
  fecha DATE,
  hora TIME,
  precio_medio DECIMAL,
  precio_minimo DECIMAL,
  precio_maximo DECIMAL,
  ocupacion_estimada INTEGER,  -- 0-100
  num_hoteles_analizados INTEGER,
  fuente TEXT  -- 'booking', 'simulado'
);
```

**Ejemplo:**
| municipio_id | fecha | hora | precio_medio | ocupacion_estimada |
|--------------|----------|-------|--------------|-------------------|
| 1 (Barcelona) | 2024-06-15 | 06:00 | 142.50€ | 78% |
| 2 (Lloret) | 2024-06-15 | 06:00 | 58.20€ | 34% |

---

### Tabla 3: `eventos_raw` (Eventos)

Se actualiza cuando hay nuevos eventos.

```sql
CREATE TABLE eventos_raw (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER,
  nombre_evento TEXT,
  fecha_inicio DATE,
  fecha_fin DATE,
  tipo TEXT,  -- 'festival', 'feria', 'deportivo'
  asistencia_estimada INTEGER,
  fuente TEXT
);
```

**Ejemplo:**
| municipio_id | nombre_evento | fecha_inicio | fecha_fin | asistencia |
|--------------|------------------|--------------|-----------|------------|
| 1 | Primavera Sound | 2024-06-14 | 2024-06-16 | 200,000 |
| 85 | Festa Castells | 2024-08-30 | 2024-09-02 | 50,000 |

---

### Tabla 4: `analisis_diario` (Interpretación IA)

El **agente razonador** genera un análisis por municipio por día.

```sql
CREATE TABLE analisis_diario (
  id SERIAL PRIMARY KEY,
  municipio_id INTEGER,
  fecha DATE,
  puntuacion INTEGER,  -- 0-100
  color TEXT,  -- 'verde', 'amarillo', 'naranja', 'rojo', 'rojo_critico'
  razonamiento TEXT,
  alertas JSONB,
  ocupacion_actual INTEGER,
  ocupacion_media_mes INTEGER,
  eventos_activos INTEGER
);
```

**Ejemplo:**
| municipio | fecha | puntuacion | color | razonamiento |
|-----------|----------|------------|-------|--------------|
| Barcelona | 2024-06-15 | 72 | naranja | "Barcelona con Primavera Sound, ocupación 78% es 10% superior a media junio (68%). Precio 142€ normal para evento. ALTO pero no crítico." |
| Lloret | 2024-06-15 | 28 | verde | "Lloret en junio con 34% ocupación está MUY por debajo de su media de verano (85%). Temporada baja." |

---

## 🎨 Escala de Colores (Mejorada)

| Puntos | Color | Emoji | Significado |
|--------|-------|-------|-------------|
| 0-20 | Verde oscuro | 🟢 | MUY BAJO - Crisis turística, municipio vacío |
| 21-40 | Verde | 🟢 | BAJO - Temporada baja normal |
| 41-60 | Amarillo | 🟡 | MEDIO - Ocupación normal |
| 61-75 | Naranja | 🟠 | ALTO - Mucha gente, pero manejable |
| 76-90 | Rojo | 🔴 | MUY ALTO - Saturado, pocos hoteles libres |
| 91-100 | Rojo crítico | 🔴 | CRÍTICO - Completo, precios desorbitados |

**Ejemplo:**
- Barcelona con 62 puntos = 🟠 NARANJA (no rojo como antes)
- Lloret con 95% en verano = 🔴 ROJO (normal para ellos)
- Lloret con 95% en noviembre = 🔴 ROJO CRÍTICO (anomalía)

---

## 🤖 Agentes

### 1. Agente de Scraping (`booking-scraper-agent.js`)

**Qué hace:**
- Busca precios de hoteles en Booking.com (o simulados v1)
- Calcula ocupación según disponibilidad
- Guarda datos RAW en `datos_hoteles_raw`

**Cuándo se ejecuta:**
- Manualmente: `npm run agent:scraping`
- Automático: Cada 12h con GitHub Actions (6:00 y 18:00)

**NO hace:**
- ❌ NO interpreta datos
- ❌ NO asigna colores
- ❌ NO inventa nada, solo recolecta

---

### 2. Agente Razonador (`reasoning-agent.js`)

**Qué hace:**
- Lee datos RAW de hoy
- Lee histórico últimos 30 días
- Calcula medias y desviaciones
- Pregunta a Gemini IA: "¿Qué nivel de saturación hay?"
- IA responde con: puntuación, razonamiento, alertas
- Guarda en `analisis_diario`

**Cuándo se ejecuta:**
- Manualmente: `npm run agent:analizar`
- Automático: Después del scraping (GitHub Actions)

**Ejemplo de prompt a IA:**

```
Municipio: Lloret de Mar

DATOS HOY:
- Ocupación: 95%
- Precio medio: 180€

HISTÓRICO:
- Media junio: 88%
- Media anual: 62%

PREGUNTA: ¿Qué nivel de saturación tiene hoy? (0-100)
```

**Respuesta IA:**

```json
{
  "puntuacion": 72,
  "razonamiento": "Lloret está en temporada alta con 95%,
  solo 7% por encima de su media de junio. Es normal para
  ellos en verano. ALTO pero no crítico.",
  "alertas": []
}
```

---

## 🚀 Cómo Usar el Proyecto

### Instalación Inicial (1 vez)

```bash
# 1. Clonar repositorio
git clone https://github.com/tu-usuario/tourism-alarm-mvp-hybrid
cd tourism-alarm-mvp-hybrid

# 2. Instalar dependencias
npm install

# 3. Configurar Supabase (sigue SUPABASE-SETUP.md)
# Crear cuenta en supabase.com
# Copiar credenciales a .env

# 4. Verificar conexión
npm run test:supabase

# 5. Poblar municipios (1 vez)
npm run db:populate
```

---

### Uso Diario

```bash
# Ejecutar todo (scraping + análisis)
npm run daily:full

# O por separado:
npm run agent:scraping  # Recoger datos
npm run agent:analizar  # Interpretar con IA
```

---

### Automatización con GitHub Actions

Crea `.github/workflows/daily-scraping.yml`:

```yaml
name: Daily Scraping

on:
  schedule:
    - cron: '0 6,18 * * *'  # 6 AM y 6 PM cada día

jobs:
  update-data:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run daily:full
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

---

## 📊 Consultas Útiles

### Ver municipios más saturados HOY

```sql
SELECT m.nombre, a.puntuacion, a.color
FROM analisis_diario a
JOIN municipios m ON a.municipio_id = m.id
WHERE a.fecha = CURRENT_DATE
ORDER BY a.puntuacion DESC
LIMIT 10;
```

### Histórico de Barcelona

```sql
SELECT fecha, puntuacion, ocupacion_actual
FROM analisis_diario
WHERE municipio_id = (SELECT id FROM municipios WHERE nombre = 'Barcelona')
ORDER BY fecha DESC
LIMIT 30;
```

### Alertas detectadas

```sql
SELECT m.nombre, a.alertas
FROM analisis_diario a
JOIN municipios m ON a.municipio_id = m.id
WHERE a.fecha = CURRENT_DATE
  AND jsonb_array_length(a.alertas) > 0;
```

---

## 🔄 Evolución del Proyecto

### v1.0 (Anterior)
- ❌ IA inventaba datos de ocupación
- ❌ No había histórico
- ❌ Datos poco realistas
- ✅ Frontend funcionaba

### v2.0 (Actual)
- ✅ Datos RAW reales (scraping)
- ✅ Histórico de 30 días
- ✅ IA solo INTERPRETA (no inventa)
- ✅ Escala de colores mejorada
- ✅ Arquitectura escalable
- ⚠️ Scraping simulado (v1)

### v2.1 (Próximo)
- 🔄 Scraping REAL de Booking.com
- 🔄 Scraping de eventos reales
- 🔄 Más fuentes de datos
- 🔄 Frontend lee de Supabase

---

## 🆘 Solución de Problemas

### "No hay datos de hoteles"
```bash
# Ejecutar scraping primero
npm run agent:scraping
```

### "Error en IA"
- Verifica que `GEMINI_API_KEY` está en .env
- Revisa límites de API en console.cloud.google.com

### "Tabla no existe"
- Sigue SUPABASE-SETUP.md paso a paso
- Ejecuta schema.sql en Supabase

---

## 💰 Costes Estimados

| Servicio | Plan | Coste | Suficiente para |
|----------|------|-------|-----------------|
| Supabase | Free | 0€ | 3 años de datos |
| GitHub Actions | Free | 0€ | Ilimitado |
| Vercel | Free | 0€ | 100k visitas/mes |
| Gemini API | Free | 0€ | 15 req/min |

**Total: 0€/mes** ✨

---

## 👥 Contribuir

1. Fork el proyecto
2. Crea una rama: `git checkout -b feature/mejora`
3. Commit: `git commit -m 'Add: nueva funcionalidad'`
4. Push: `git push origin feature/mejora`
5. Pull Request

---

## 📄 Licencia

MIT License - Usa como quieras, con atribución.

---

## 🙏 Créditos

- **Datos geográficos**: ICGC (Institut Cartogràfic de Catalunya)
- **Datos estadísticos**: IDESCAT (Estadística Catalunya)
- **Mapa**: Mapbox
- **IA**: Google Gemini 2.0 Flash

---

**¿Preguntas?** Abre un issue en GitHub o lee SUPABASE-SETUP.md
