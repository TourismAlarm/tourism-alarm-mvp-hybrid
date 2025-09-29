# 🚨 Tourism Alarm Catalunya - MVP Híbrido

Sistema de alertas turísticas para Catalunya que combina **datos reales de IDESCAT** con **visualización moderna** en tiempo casi real.

## 🚀 Características

- ✅ **947 municipios** de Catalunya con coordenadas precisas
- ✅ **25+ coordenadas exactas** (Barcelona, Girona, Reus, etc.)
- ✅ **Datos reales IDESCAT** + fallback inteligente
- ✅ **Heatmap interactivo** con Leaflet + intensidad por colores
- ✅ **Actualización automática** cada 6 horas (configurable)
- ✅ **Deploy en Vercel** con cron jobs

## 📊 Vista Previa
🗺️ Mapa interactivo Catalunya
🟢 Verde: Baja intensidad (< 40%)
🟡 Amarillo: Media intensidad (40-60%)
🟠 Naranja: Alta intensidad (60-80%)
🔴 Rojo: Intensidad crítica (> 80%)

## 🛠️ Desarrollo Local
```bash
# 1. Instalar dependencias
npm install

# 2. Generar datos de Catalunya
npm run fetch:data

# 3. Arrancar desarrollo
npm run dev

# 4. Abrir navegador
# http://localhost:5173
```

## 🔧 Comandos Útiles
```bash
npm run fetch:data      # Conectar IDESCAT y generar JSON
npm run test:data       # Verificar datos generados
npm run build          # Build producción
npm run preview        # Preview build local
```

## 📈 Expansión Futura

🤖 **IA Predictiva**: Análisis con Claude/LLM
🌤️ **APIs Clima**: OpenWeather integration
🎫 **Eventos**: Ticketmaster + festivales
📱 **Mobile**: PWA + notificaciones push

## 📄 Licencia
MIT - Úsalo, modifícalo, mejóralo