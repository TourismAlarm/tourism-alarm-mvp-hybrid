# 🚀 Configurar Google Gemini (GRATIS)

## Por Qué Gemini

✅ **Completamente GRATIS**
✅ **60 requests/minuto** (vs 5/min de Claude gratis)
✅ **Sin límite mensual** con cuenta estándar
✅ **Gemini 1.5 Flash** - Ultra rápido
✅ **Gemini 1.5 Pro** - Más potente que Claude Sonnet

**Si tienes Google AI Pro**: Límites aún más altos + funciones premium

---

## 📋 Paso a Paso (2 minutos)

### 1. Obtener API Key

```bash
# Abre en tu navegador:
https://aistudio.google.com/apikey
```

**Pasos en la web**:
1. Inicia sesión con tu cuenta Google (la que tiene AI Pro)
2. Click **"Create API Key"**
3. Selecciona **"Create API key in new project"** (o usa uno existente)
4. Copia la key (empieza con `AIzaSy...`)

**Tiempo**: ~30 segundos

---

### 2. Configurar en el Proyecto

**Opción A: Archivo .env (Recomendado)**
```bash
# En tu terminal local
cd /ruta/a/tu/proyecto/tourism-alarm-mvp-hybrid/tourism-alarm-mvp-hybrid

# Crear archivo .env
echo "GEMINI_API_KEY=AIzaSy..." > .env
```

**Opción B: Variable de entorno temporal**
```bash
export GEMINI_API_KEY="AIzaSy..."
```

---

### 3. Verificar que Funciona

```bash
# Test rápido con 5 municipios
npm run agent:test
```

**Deberías ver**:
```
🤖 AGENTE UNIVERSAL DE TURISMO (Gemini + Claude)

🤖 Usando Google Gemini AI
📊 Total municipios: 903
🎯 Límite: 5

[1/5] Procesando...
🔍 Procesando: Arres (250313)
  ✅ Datos encontrados (confianza: 78%)
...
```

---

## 🎯 Usar el Agente

### Test Rápido (5 municipios)
```bash
npm run agent:test
```

### Batch Normal (50 municipios)
```bash
npm run agent:scrape
```

### Batch Grande (100 municipios)
```bash
npm run agent:big
```

### Personalizado
```bash
node agents/universal-agent.js --limit=200
```

---

## ⚡ Velocidad Comparativa

| Agente | Tiempo por Municipio | 100 Municipios | Costo |
|--------|---------------------|----------------|-------|
| **Gemini Flash** | ~1 segundo | ~2 minutos | **GRATIS** |
| Claude Haiku | ~1.5 segundos | ~3 minutos | ~$1.50 |
| Claude Sonnet | ~2 segundos | ~4 minutos | ~$3.00 |

**Gemini es más rápido Y gratis** 🚀

---

## 💰 Límites de API

### Cuenta Estándar (Gratis)
- **60 requests/minuto**
- **1500 requests/día**
- **Gemini 1.5 Flash**: Gratis sin límite
- **Gemini 1.5 Pro**: 50 requests/día gratis

### Con Google AI Pro (Tu caso)
- **Límites más altos**
- **Prioridad en requests**
- **Acceso a modelos experimentales**

**Para 947 municipios**: Completamente dentro de límites gratuitos ✅

---

## 🔧 Troubleshooting

### Error: "API key not valid"
```bash
# Verifica que la copiaste bien (sin espacios)
echo $GEMINI_API_KEY
```

### Error: "Quota exceeded"
```bash
# Aumenta el delay entre requests
node agents/universal-agent.js --limit=50 # Espera 1 segundo entre cada uno
```

### Error: "Module not found"
```bash
# Reinstala dependencias
npm install
```

---

## 📊 Siguiente Paso

Una vez configurado, ejecuta:

```bash
# 1. Test de 5 municipios
npm run agent:test

# 2. Si funciona, procesa más
npm run agent:scrape  # 50 municipios

# 3. Revisa resultados
cat agents/enriched-data.json

# 4. Copia código generado a data/real-tourism-data.js
# (El agente lo imprime al final)

# 5. Regenera y builda
node scripts/generate-from-topojson.js
npm run build
```

---

## 🎯 Objetivo

**Enriquecer 100+ municipios en 5 minutos, gratis** 🚀

Con Gemini puedes procesar **TODA CATALUNYA (947 municipios) en ~20 minutos sin pagar nada**.

---

## 🆚 Gemini vs Claude

| Feature | Gemini Flash | Claude Sonnet |
|---------|-------------|---------------|
| Velocidad | ⚡⚡⚡⚡⚡ | ⚡⚡⚡ |
| Precisión | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Costo | **GRATIS** | ~$3/100 munis |
| Límite/día | 1500 | Ilimitado ($$) |
| Mejor para | Extracción datos | Análisis complejo |

**Para este proyecto**: Gemini Flash es perfecto ✅

---

## 📞 Soporte

Si tienes problemas:
1. Verifica que GEMINI_API_KEY esté configurada: `echo $GEMINI_API_KEY`
2. Prueba con limit bajo: `npm run agent:test`
3. Revisa logs de error en la terminal
