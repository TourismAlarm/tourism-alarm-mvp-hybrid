# 🤖 Agentes IA para Tourism Alarm

Sistema de agentes autónomos que usan **Gemini** (gratis) o **Claude** (pago) para enriquecer datos turísticos automáticamente.

## ⚡ Recomendación: Usa Gemini (GRATIS)

**Google Gemini** es más rápido y completamente gratuito:
- ✅ **Sin costo** (vs $1-3 por 100 municipios en Claude)
- ✅ **60 requests/minuto** (vs 5/min gratis en Claude)
- ✅ **Ultra rápido** - Gemini 1.5 Flash
- ✅ **Excelente precisión** para extracción de datos

**Ver guía completa**: [GEMINI-SETUP.md](./GEMINI-SETUP.md)

## 🚀 Quick Start

### 1. Configurar API Key (Elige UNA)

**Opción A: Gemini (Recomendado - Gratis)**
```bash
# 1. Obtén key: https://aistudio.google.com/apikey
# 2. Configura:
export GEMINI_API_KEY="AIzaSy..."

# O crea archivo .env
echo "GEMINI_API_KEY=AIzaSy..." > .env
```

**Opción B: Claude (De pago)**
```bash
# 1. Obtén key: https://console.anthropic.com/settings/keys
# 2. Configura:
export ANTHROPIC_API_KEY="sk-ant-api03-..."

# O crea archivo .env
echo "ANTHROPIC_API_KEY=sk-ant-api03-..." > .env
```

**Nota**: El agente usa automáticamente Gemini si ambas están configuradas (preferencia por gratuita)

### 2. Verificar Configuración

```bash
# Verificar que todo está configurado correctamente
npm run agent:setup
```

### 3. Ejecutar el Agente de Scraping

```bash
# Test rápido con 5 municipios
npm run agent:test

# Procesar 50 municipios (default)
npm run agent:scrape

# Procesar 100 municipios
npm run agent:big

# Probar con datos mock (sin API key)
npm run agent:mock
```

## 📊 Agentes Disponibles

### tourism-data-scraper.js

**Objetivo**: Enriquecer municipios sin datos reales usando IA

**Proceso**:
1. Intenta obtener datos de IDESCAT API
2. Si falla, usa Claude para buscar en su conocimiento
3. Claude valida y estructura los datos automáticamente
4. Guarda resultados en `agents/enriched-data.json`

**Salida**:
```json
{
  "generated_at": "2024-11-20T12:00:00Z",
  "stats": {
    "total": 50,
    "success": 48,
    "failed": 2
  },
  "municipalities": {
    "170329": {
      "name": "Cadaqués",
      "code": "170329",
      "population": 2781,
      "hotel_places": 2500,
      "categoria": "costa",
      "tourism_intensity": 0.85,
      "confidence": 0.95,
      "source": "AI_Knowledge"
    }
  }
}
```

**Campos generados**:
- `population`: Población oficial o estimada
- `hotel_places`: Plazas hoteleras (0 si no hay datos)
- `categoria`: costa/montaña/ciudad/interior
- `tourism_intensity`: 0.0-1.0 (base, sin multiplicadores temporales)
- `confidence`: 0.0-1.0 (confianza del agente en los datos)
- `source`: IDESCAT, AI_Knowledge, o Fallback_Estimate

## 🔄 Integración con real-tourism-data.js

Después de ejecutar el agente:

1. **Revisar resultados**:
```bash
cat agents/enriched-data.json
```

2. **Ver código generado** (al final de la ejecución):
El agente imprime código listo para copiar a `data/real-tourism-data.js`

3. **Copiar municipios de alta confianza** (confidence > 0.6):
```javascript
// En data/real-tourism-data.js, añadir:
'170329': { name: 'Cadaqués', population: 2781, hotel_places: 2500, tourism_intensity: 0.85, categoria: 'costa' }, // AI_Knowledge (95%)
```

4. **Regenerar datos**:
```bash
node scripts/generate-from-topojson.js
npm run build
```

## 🎯 Estrategias del Agente

### Nivel 1: IDESCAT API (Máxima Confianza)
- Intenta múltiples endpoints de IDESCAT
- Claude interpreta respuestas complejas
- Confidence: 0.8-1.0

### Nivel 2: AI Knowledge (Alta Confianza)
- Claude usa su conocimiento de Catalunya
- Estima basándose en municipios similares
- Confidence: 0.6-0.9

### Nivel 3: Fallback Estimate (Baja Confianza)
- Estimación genérica para pueblo pequeño
- Usado solo si todo lo demás falla
- Confidence: 0.3-0.5

## 📈 Métricas de Éxito

**Objetivo**: 100+ municipios enriquecidos con confidence > 0.7

**Tasa de éxito esperada**:
- IDESCAT: ~20-30% municipios
- AI Knowledge: ~60-70% municipios
- Fallback: ~10% municipios

**Tiempo estimado**:
- 5 municipios: ~30 segundos
- 50 municipios: ~3-5 minutos
- 100 municipios: ~7-10 minutos

## 💡 Tips

### Optimizar Costos

```bash
# Procesar solo municipios turísticos conocidos primero
# Crear lista manual de los 50-100 principales destinos
# Ejecutar el agente solo para esos municipios
```

### Validar Resultados

```bash
# Revisar municipios con baja confianza
jq '.municipalities | to_entries | map(select(.value.confidence < 0.7))' agents/enriched-data.json

# Ver distribución de categorías
jq '[.municipalities[].categoria] | group_by(.) | map({categoria: .[0], count: length})' agents/enriched-data.json
```

### Batch Processing

Para procesar todos los municipios en varios batches:

```bash
# Batch 1: Municipios 1-100
node agents/tourism-data-scraper.js --limit=100

# Batch 2: Municipios 101-200
# (Modificar código para skip primeros 100)
```

## 🐛 Troubleshooting

### Error: ANTHROPIC_API_KEY no configurada
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

### Error: Rate limit exceeded
El agente tiene delay de 1.5s entre requests. Si aún falla:
```javascript
// Aumentar delay en tourism-data-scraper.js:
delay: 3000 // 3 segundos
```

### Error: JSON parse failed
Claude a veces devuelve texto antes del JSON. El agente maneja esto automáticamente, pero si falla revisa manualmente:
```bash
# Ver raw response en logs
```

## 🔮 Próximos Agentes (Roadmap)

- **hotel-occupation-agent.js**: Ocupación hotelera en tiempo real
- **event-detector-agent.js**: Detectar festivales y eventos
- **weather-enricher-agent.js**: Integrar pronóstico del tiempo
- **ml-trainer-agent.js**: Entrenar modelo de predicción
- **alert-monitor-agent.js**: Monitoreo y alertas automáticas

## 📚 Más Información

Ver plan completo en: `.claude/AI-ENRICHMENT-PLAN.md`
