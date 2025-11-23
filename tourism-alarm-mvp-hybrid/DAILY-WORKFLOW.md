# 📅 Flujo de Trabajo Diario - Tourism Alarm Catalunya

## Resumen Ejecutivo

Cada mañana, ejecuta **UN SOLO COMANDO** para actualizar todo el mapa:

```powershell
npm run daily:full
```

---

## Arquitectura de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATOS ESTÁTICOS (una vez)                    │
│         Población, plazas hoteleras, categoría                  │
│                                                                  │
│    Archivo: data/static-municipality-data.json                  │
│    Comando: npm run db:generate                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  DATOS DINÁMICOS (cada día)                     │
│    Ocupación actual, eventos, tendencias, clima                 │
│                                                                  │
│    Archivo: data/daily-snapshots/YYYY-MM-DD.json                │
│    Comando: npm run daily:snapshot                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    MAPA ACTUALIZADO                             │
│         Coropleta con datos de ocupación real                   │
│                                                                  │
│    Archivo: public/data/current.json                            │
│    Visualización: Polígonos coloreados por intensidad           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Comandos Disponibles

### 📊 Datos Estáticos (ejecutar UNA VEZ o cuando cambien datos base)

```powershell
npm run db:generate     # Genera base de datos estática de 947 municipios
npm run agent:scrape    # Enriquecer 50 municipios sin datos con IA
npm run agent:big       # Enriquecer 100 municipios
```

### 📅 Datos Dinámicos (ejecutar CADA DÍA)

```powershell
npm run daily:snapshot  # Obtener ocupación actual de todas las zonas
npm run daily:compare   # Comparar con el año anterior
```

### 🚀 Flujo Completo (TODO EN UNO)

```powershell
npm run daily:full      # Snapshot + Generar mapa + Build
```

### 🔧 Utilidades

```powershell
npm run agent:setup     # Verificar configuración API
npm run dev             # Ver la app en localhost
npm run build           # Build para producción
```

---

## Tu Rutina Diaria (5 minutos)

### Opción A: Automático (recomendado)

```powershell
# 1. Abrir PowerShell en la carpeta del proyecto
cd C:\users\jordi\tourism-alarm-mvp-hybrid

# 2. Ejecutar TODO con un comando
npm run daily:full

# 3. Ver el resultado
npm run dev
```

### Opción B: Paso a paso (para control total)

```powershell
# 1. Obtener ocupación actual de las zonas turísticas
npm run daily:snapshot

# 2. Ver comparativa con año anterior
npm run daily:compare

# 3. Regenerar datos del mapa
npm run fetch:data

# 4. Build para producción
npm run build

# 5. Ver resultado
npm run dev
```

---

## ¿Qué datos se obtienen cada día?

El agente `daily:snapshot` pregunta a Gemini AI sobre 12 zonas turísticas:

| Zona | Municipios incluidos |
|------|---------------------|
| Costa Brava Norte | Roses, Cadaqués, L'Escala, Empuriabrava |
| Costa Brava Centro | Lloret de Mar, Tossa de Mar, Blanes |
| Costa Brava Sur | Palamós, Sant Feliu de Guíxols, Platja d'Aro |
| Costa Dorada | Salou, Cambrils, Tarragona, PortAventura |
| Barcelona Ciudad | Barcelona centro, Gràcia, Barceloneta |
| Costa Barcelona | Sitges, Castelldefels, Vilanova |
| Val d'Aran | Vielha, Baqueira-Beret, Naut Aran |
| Cerdanya | Puigcerdà, La Molina, Masella, Alp |
| Pallars-Ribagorça | Sort, Vall de Boí, Aigüestortes |
| Garrotxa | Olot, Besalú, Zona Volcánica |
| Penedès | Vilafranca, Sant Sadurní, Bodegas |
| Montserrat | Monasterio de Montserrat y alrededores |

Para cada zona obtiene:
- 📊 **Ocupación hotelera** (0-100%)
- 🌡️ **Presión turística** (0.0-1.0)
- 🎭 **Eventos activos** (festivales, conciertos, etc.)
- ☀️ **Impacto del clima** (-0.3 a +0.3)
- 📈 **Tendencia** (subiendo/estable/bajando)

---

## Archivos Generados

```
data/
├── static-municipality-data.json    # Datos fijos (947 municipios)
├── historical-data.json             # Histórico anual
└── daily-snapshots/
    ├── 2024-11-23.json              # Snapshot de hoy
    ├── 2024-11-24.json              # Mañana
    └── latest.json                  # Siempre el más reciente

public/data/
├── current.json                     # Datos para el mapa
└── last-good.json                   # Backup automático
```

---

## Automatización con GitHub Actions (opcional)

Para que se ejecute automáticamente cada día sin tu intervención, crea `.github/workflows/daily-update.yml`:

```yaml
name: Daily Tourism Update

on:
  schedule:
    - cron: '0 6 * * *'  # Cada día a las 6:00 AM UTC (7:00 España)
  workflow_dispatch:      # Permitir ejecución manual

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install

      - run: npm run daily:full
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}

      - uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "🔄 Daily tourism data update"
```

Luego añade `GEMINI_API_KEY` en GitHub > Settings > Secrets.

---

## Troubleshooting

### Error: "GEMINI_API_KEY no configurada"
```powershell
# Verificar que existe .env
cat .env

# Si no existe, crearlo
echo "GEMINI_API_KEY=AIzaSy..." > .env
```

### Error: "Rate limit exceeded"
Espera 1 minuto y vuelve a ejecutar. Gemini tiene límite de 60 requests/minuto.

### Los datos no se actualizan en la web
```powershell
# Forzar regeneración completa
npm run fetch:data
npm run build
```

---

## Coste

- **Gemini API**: GRATIS (60 requests/minuto)
- **Vercel hosting**: GRATIS (hobby plan)
- **GitHub Actions**: GRATIS (2000 minutos/mes)

**Total: 0€/mes**
