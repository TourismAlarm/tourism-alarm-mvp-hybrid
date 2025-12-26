# 🗄️ Configuración de Supabase - Tourism Alarm

Guía paso a paso para configurar Supabase como base de datos del proyecto.

---

## 📋 ¿Qué es Supabase?

Supabase es una **base de datos PostgreSQL en la nube** con API automática. Piensa en ello como:
- **Google Sheets pero para datos masivos** (millones de filas)
- **Base de datos automática** que tu web puede leer directamente
- **GRATIS** hasta 500 MB (suficiente para 2-3 años de datos)

---

## 🚀 Paso 1: Crear Cuenta en Supabase

### 1.1 Ir a Supabase

Abre tu navegador y ve a: **https://supabase.com**

### 1.2 Crear cuenta

- Haz clic en **"Start your project"**
- Puedes registrarte con:
  - ✅ GitHub (recomendado)
  - ✅ Email

### 1.3 Verificar email

Si usaste email, revisa tu correo y haz clic en el enlace de verificación.

---

## 🏗️ Paso 2: Crear Proyecto

### 2.1 Crear nuevo proyecto

Una vez dentro del panel de Supabase:

1. Haz clic en **"New Project"**
2. Rellena los datos:
   - **Name**: `tourism-alarm` (o el nombre que quieras)
   - **Database Password**: Elige una contraseña segura (guárdala, la necesitarás)
   - **Region**: Selecciona **Europe (Frankfurt)** (más cercano a España)
   - **Pricing Plan**: Deja **Free** (gratis)
3. Haz clic en **"Create new project"**

⏱️ **Espera 2-3 minutos** mientras Supabase crea tu base de datos.

---

## 🔑 Paso 3: Obtener Credenciales

Una vez creado el proyecto, verás el panel principal.

### 3.1 Ir a configuración

1. En el menú lateral, haz clic en el **icono de engranaje** ⚙️ (Settings)
2. Luego haz clic en **"API"**

### 3.2 Copiar credenciales

Verás dos cosas importantes:

#### 📍 Project URL
```
https://xxxxxxxxxxxxx.supabase.co
```
**→ Copia esta URL**

#### 🔐 API Keys

Verás dos keys:
- **anon / public**: Esta es la que usarás (es segura para el frontend)
- **service_role**: NO la uses (es solo para el servidor)

**→ Copia la key `anon` / `public`**

---

## 📝 Paso 4: Guardar Credenciales en .env

### 4.1 Abrir archivo .env

En tu proyecto, abre el archivo `.env` (si no existe, créalo)

### 4.2 Añadir credenciales

Añade estas líneas al archivo:

```env
# Supabase
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZi...
```

**Reemplaza:**
- `https://xxxxxxxxxxxxx.supabase.co` → con tu Project URL
- `eyJhbGciOiJIUz...` → con tu API Key `anon`

### 4.3 Guardar archivo

Guarda el archivo `.env`

---

## 🗃️ Paso 5: Crear Tablas (Schema)

### 5.1 Ir al SQL Editor

1. En Supabase, haz clic en **"SQL Editor"** en el menú lateral
2. Haz clic en **"New query"**

### 5.2 Copiar el schema

Abre el archivo `supabase/schema.sql` de este proyecto y **copia TODO el contenido**.

### 5.3 Pegar y ejecutar

1. Pega el contenido en el editor SQL de Supabase
2. Haz clic en **"Run"** (abajo a la derecha)

✅ **Deberías ver:** "Success. No rows returned"

### 5.4 Verificar tablas

1. En el menú lateral, haz clic en **"Table Editor"**
2. Deberías ver 4 tablas:
   - ✅ `municipios`
   - ✅ `datos_hoteles_raw`
   - ✅ `eventos_raw`
   - ✅ `analisis_diario`

---

## 📊 Paso 6: Poblar Tabla Municipios

Ahora vamos a rellenar la tabla `municipios` con los 947 municipios de Catalunya.

### 6.1 Ejecutar script

Abre una terminal en tu proyecto y ejecuta:

```bash
node scripts/populate-municipios.js
```

### 6.2 Verificar

En Supabase:
1. Ve a **"Table Editor"**
2. Haz clic en la tabla **"municipios"**
3. Deberías ver ~947 filas

---

## ✅ Paso 7: Verificar que Todo Funciona

### 7.1 Probar agente de scraping

```bash
node agents/booking-scraper-agent.js
```

**Deberías ver:**
```
🏨 AGENTE SCRAPING BOOKING - Iniciando
📋 Obteniendo municipios turísticos...
✅ Encontrados X municipios turísticos
...
```

### 7.2 Verificar datos en Supabase

1. Ve a **"Table Editor"** → **"datos_hoteles_raw"**
2. Deberías ver datos nuevos con la fecha de hoy

### 7.3 Probar agente razonador

```bash
node agents/reasoning-agent.js
```

**Deberías ver:**
```
🧠 AGENTE RAZONADOR - Iniciando
🔄 Analizando municipios con IA...
...
```

### 7.4 Verificar análisis

1. Ve a **"Table Editor"** → **"analisis_diario"**
2. Deberías ver análisis con puntuaciones y colores

---

## 🎯 Paso 8: Conectar el Mapa

### 8.1 Crear cliente Supabase en el frontend

En tu archivo JavaScript del mapa (ej: `public/js/map.js`):

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://xxxxxxxxxxxxx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'

const supabase = createClient(supabaseUrl, supabaseKey)
```

### 8.2 Leer datos del mapa

```javascript
async function cargarDatosMapa() {
  const { data, error } = await supabase
    .from('vista_mapa_actual')
    .select('*')

  if (error) {
    console.error('Error:', error)
    return
  }

  // Pintar mapa con los datos
  data.forEach(municipio => {
    pintarMunicipio(municipio.nombre, municipio.color, municipio.puntuacion)
  })
}
```

---

## 🔄 Automatización (GitHub Actions)

Para que los agentes se ejecuten automáticamente cada 12 horas, necesitas:

### 9.1 Añadir secrets a GitHub

1. Ve a tu repositorio en GitHub
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret**
4. Añade 3 secrets:
   - `SUPABASE_URL`: tu URL de Supabase
   - `SUPABASE_ANON_KEY`: tu API Key
   - `GEMINI_API_KEY`: tu clave de Gemini

### 9.2 Crear workflow

Crea el archivo `.github/workflows/daily-scraping.yml`:

```yaml
name: Daily Scraping

on:
  schedule:
    - cron: '0 6,18 * * *'  # 6:00 AM y 6:00 PM cada día
  workflow_dispatch:  # También permite ejecución manual

jobs:
  scraping:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm install

      - name: Scraping Booking
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
        run: node agents/booking-scraper-agent.js

      - name: Análisis IA
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
        run: node agents/reasoning-agent.js
```

---

## 📊 Consultas Útiles en Supabase

### Ver datos de hoy

```sql
SELECT m.nombre, a.puntuacion, a.color, a.ocupacion_actual
FROM analisis_diario a
JOIN municipios m ON a.municipio_id = m.id
WHERE a.fecha = CURRENT_DATE
ORDER BY a.puntuacion DESC
LIMIT 10;
```

### Ver municipios más saturados

```sql
SELECT m.nombre, a.puntuacion, a.color
FROM analisis_diario a
JOIN municipios m ON a.municipio_id = m.id
WHERE a.fecha = CURRENT_DATE
  AND a.color IN ('rojo', 'rojo_critico')
ORDER BY a.puntuacion DESC;
```

### Ver histórico de un municipio

```sql
SELECT fecha, puntuacion, ocupacion_actual
FROM analisis_diario
WHERE municipio_id = (
  SELECT id FROM municipios WHERE nombre = 'Barcelona'
)
ORDER BY fecha DESC
LIMIT 30;
```

---

## 🆘 Solución de Problemas

### Error: "Invalid API key"

- Verifica que copiaste la key **anon** (no la service_role)
- Verifica que no tiene espacios al principio/final

### Error: "Table does not exist"

- Vuelve al Paso 5 y ejecuta el schema.sql
- Verifica que dice "Success"

### Error: "No data returned"

- Primero ejecuta: `node scripts/populate-municipios.js`
- Luego: `node agents/booking-scraper-agent.js`
- Finalmente: `node agents/reasoning-agent.js`

### Los agentes no se ejecutan automáticamente

- Verifica que añadiste los secrets en GitHub
- Ve a **Actions** en tu repo y mira si hay errores

---

## 💰 Costes (Recordatorio)

### Plan Gratis de Supabase incluye:

- ✅ 500 MB de base de datos
- ✅ 1 GB de transferencia/mes
- ✅ 50,000 usuarios activos/mes
- ✅ API automática
- ✅ Backups semanales

**Estimación para Tourism Alarm:**
- 947 municipios × 365 días × 2 registros/día = ~700,000 filas/año
- Tamaño estimado: ~150 MB/año
- **Conclusión: El plan gratis dura 3 años sin problemas**

### Cuándo necesitarás pagar:

Solo si:
- Superas 500 MB (3+ años de datos)
- Tienes 1M+ de visitas al mes
- Necesitas backups diarios

**Plan Pro: 25€/mes** (8 GB, backups diarios)

---

## 🎉 ¡Listo!

Ya tienes Supabase configurado. Ahora:

1. ✅ Los agentes guardan datos RAW
2. ✅ El agente razonador interpreta con IA
3. ✅ Tu mapa lee datos actualizados
4. ✅ Todo automático cada 12 horas

**Siguiente paso:** Configurar el frontend para leer de Supabase en vez de archivos JSON.
