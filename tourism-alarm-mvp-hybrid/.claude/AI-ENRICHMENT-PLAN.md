# 🤖 Plan Progresivo: Tourism Alarm con IA y Agentes

**Objetivo**: Crear una aplicación de saturación turística de nivel 10 usando IA, agentes autónomos y datos en tiempo real.

---

## 📊 Estado Actual (Punto de Partida)

✅ **Logrado**:
- 947 municipios de Catalunya con geometrías TopoJSON
- 36 municipios con datos reales (población + plazas hoteleras)
- Sistema de multiplicadores temporales por estación
- Visualización choropleth con Leaflet
- Barcelona correcta: 78% (ciudad) en noviembre
- Deployment en Vercel

⚠️ **Limitaciones**:
- Solo 3.8% municipios con datos reales (36/947)
- Datos estáticos, no en tiempo real
- Sin datos de ocupación hotelera actual
- Sin predicciones futuras
- Sin eventos especiales detectados

---

## 🎯 Visión Final (App de 10)

Una aplicación que:
1. **Actualiza datos automáticamente** cada 6 horas
2. **Predice saturación** para los próximos 7 días
3. **Detecta eventos** (festivales, conciertos, partidos) automáticamente
4. **Envía alertas** cuando un municipio supera umbral de saturación
5. **Aprende patrones** de turismo con ML
6. **Enriquece datos** con múltiples fuentes usando agentes IA

---

## 🚀 FASE 1: Agentes de Recopilación de Datos (Semana 1-2)

### 1.1 Agente Web Scraper con IA
**Objetivo**: Recopilar datos de 100+ municipios automáticamente

```javascript
// agents/tourism-data-scraper.js
import { Anthropic } from '@anthropic-ai/sdk';
import * as cheerio from 'cheerio';

class TourismDataAgent {
  constructor() {
    this.claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.sources = [
      'https://www.idescat.cat',
      'https://www.gencat.cat/turisme',
      'https://www.ine.es/jaxiT3/Tabla.htm?t=2078',
      'https://estadistiques.tourspain.es'
    ];
  }

  async enrichMunicipality(municipioName, code) {
    // 1. Buscar en IDESCAT
    const idescatData = await this.fetchIDESCAT(code);

    // 2. Si no encuentra, buscar con IA
    if (!idescatData) {
      return await this.aiSearch(municipioName);
    }

    return idescatData;
  }

  async aiSearch(municipioName) {
    // Usar Claude para buscar y extraer datos
    const prompt = `
      Busca datos turísticos oficiales para el municipio "${municipioName}" de Catalunya.
      Necesito:
      - Población actual
      - Número de plazas hoteleras
      - Categoría (costa/montaña/ciudad/interior)
      - Fuente oficial

      Usa fuentes como IDESCAT, INE, Gencat, Wikipedia.
      Responde en JSON con los campos: population, hotel_places, categoria, source, confidence.
    `;

    const response = await this.claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });

    return JSON.parse(response.content[0].text);
  }
}

// USO:
const agent = new TourismDataAgent();
const data = await agent.enrichMunicipality('Cadaqués', '170329');
```

**Resultado esperado**: 100-200 municipios con datos reales en 1-2 días de ejecución.

---

### 1.2 Agente de Ocupación Hotelera en Tiempo Real
**Objetivo**: Datos de ocupación actual desde múltiples fuentes

```javascript
// agents/hotel-occupation-agent.js
class HotelOccupationAgent {
  async getCurrentOccupation(municipio) {
    const sources = [
      this.checkBookingCom(municipio),
      this.checkINE(municipio),
      this.checkGencat(municipio)
    ];

    const results = await Promise.allSettled(sources);

    // Claude decide qué fuente es más confiable
    return await this.aiConsensus(results, municipio);
  }

  async aiConsensus(results, municipio) {
    const prompt = `
      Tengo datos de ocupación hotelera para ${municipio.name} de múltiples fuentes:

      ${JSON.stringify(results, null, 2)}

      Analiza y determina:
      1. ¿Qué fuente es más confiable?
      2. ¿Cuál es el porcentaje de ocupación más probable?
      3. ¿Hay inconsistencias que indiquen error?

      Responde con: { occupation: 0.0-1.0, confidence: 0.0-1.0, reasoning: "..." }
    `;

    const response = await this.claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }]
    });

    return JSON.parse(response.content[0].text);
  }
}
```

**Integración**:
- Ejecutar cada 6 horas vía cron
- Actualizar `current.json` automáticamente
- Guardar histórico en base de datos

---

### 1.3 Agente Detector de Eventos
**Objetivo**: Detectar festivales, conciertos, eventos que aumenten turismo

```javascript
// agents/event-detector-agent.js
class EventDetectorAgent {
  async detectEvents(municipio, dateRange) {
    const sources = [
      'https://www.barcelonaturisme.com/agenda',
      'https://www.girona.cat/sgdap/cat/agenda.php',
      'https://www.timeout.com/barcelona/es/eventos',
      'Google Calendar public events'
    ];

    // 1. Scraping de agendas
    const events = await this.scrapeEventSources(municipio, sources);

    // 2. Claude analiza y categoriza
    return await this.categorizeEvents(events, municipio);
  }

  async categorizeEvents(events, municipio) {
    const prompt = `
      He encontrado estos eventos en ${municipio.name}:

      ${JSON.stringify(events, null, 2)}

      Analiza y clasifica cada evento:
      - Impacto turístico: bajo/medio/alto/extremo
      - Tipo: festival/concierto/deportivo/cultural
      - Asistencia esperada: estimación
      - Multiplicador de intensidad: 1.0-3.0

      Responde en JSON array.
    `;

    const response = await this.claude.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }]
    });

    return JSON.parse(response.content[0].text);
  }
}
```

**Ejemplos de eventos detectables**:
- Primavera Sound Barcelona → Multiplicador 2.5x (100k+ asistentes)
- Festival de Peralada → Multiplicador 1.8x
- Partido Barça Champions → Multiplicador 1.4x
- Semana Santa en Girona → Multiplicador 1.3x

---

## 🧠 FASE 2: Machine Learning y Predicciones (Semana 3-4)

### 2.1 Modelo de Predicción de Saturación

```python
# ml/saturation_predictor.py
import pandas as pd
import numpy as np
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split

class SaturationPredictor:
    """
    Predice saturación turística para los próximos 7 días.

    Features:
    - Día de la semana (0-6)
    - Mes del año (1-12)
    - Es fin de semana (0/1)
    - Es festivo (0/1)
    - Temperatura prevista (°C)
    - Precipitación prevista (mm)
    - Eventos cercanos (0-N)
    - Histórico 7 días anteriores
    - Tipo municipio (costa/montaña/ciudad/interior)
    - Plazas hoteleras per cápita
    """

    def __init__(self):
        self.model = GradientBoostingRegressor(
            n_estimators=200,
            learning_rate=0.1,
            max_depth=5
        )

    def train(self, historical_data):
        """Entrena con datos históricos de 2-3 años"""
        X = self.prepare_features(historical_data)
        y = historical_data['saturation']

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2)

        self.model.fit(X_train, y_train)
        score = self.model.score(X_test, y_test)

        print(f"✅ Modelo entrenado con R² = {score:.3f}")

    def predict_next_7_days(self, municipio, weather_forecast, events):
        """Predice saturación para próximos 7 días"""
        predictions = []

        for day in range(7):
            features = self.build_features(municipio, day, weather_forecast, events)
            saturation = self.model.predict([features])[0]
            predictions.append({
                'date': today + timedelta(days=day),
                'predicted_saturation': saturation,
                'confidence': self.calculate_confidence(features)
            })

        return predictions
```

**Fuentes de datos para entrenamiento**:
- INE: Series temporales de ocupación hotelera 2020-2024
- IDESCAT: Datos mensuales de turismo
- Gencat: Registro de turismo de Catalunya
- Scraped data: Booking.com histórico (si disponible)

---

### 2.2 API de Predicciones

```javascript
// api/predictions.js
export default async function handler(req, res) {
  const { municipio_id } = req.query;

  // 1. Obtener clima próximos 7 días
  const weather = await fetch(`https://api.openweathermap.org/data/2.5/forecast?id=${municipio_id}`);

  // 2. Detectar eventos próximos
  const events = await eventDetectorAgent.detectEvents(municipio, next7days);

  // 3. Ejecutar modelo ML
  const predictions = await mlModel.predict_next_7_days(municipio, weather, events);

  // 4. Generar explicación con Claude
  const explanation = await generateExplanation(predictions, events);

  res.json({
    municipio,
    predictions,
    events,
    explanation
  });
}

async function generateExplanation(predictions, events) {
  const prompt = `
    Predicciones de saturación turística próximos 7 días:
    ${JSON.stringify(predictions, null, 2)}

    Eventos detectados:
    ${JSON.stringify(events, null, 2)}

    Genera una explicación breve (2-3 frases) para el usuario explicando:
    - Por qué aumenta/disminuye la saturación
    - Qué días evitar
    - Recomendaciones
  `;

  const response = await claude.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }]
  });

  return response.content[0].text;
}
```

**Ejemplo de respuesta**:
```json
{
  "municipio": "Barcelona",
  "predictions": [
    { "date": "2024-11-21", "saturation": 0.82, "confidence": 0.91 },
    { "date": "2024-11-22", "saturation": 0.88, "confidence": 0.89 },
    { "date": "2024-11-23", "saturation": 0.95, "confidence": 0.87 }
  ],
  "events": [
    {
      "name": "Black Friday Sales",
      "impact": "alto",
      "multiplier": 1.15
    }
  ],
  "explanation": "La saturación aumentará este fin de semana debido a Black Friday y buen tiempo previsto. Se recomienda evitar el sábado 23. El lunes 25 será el mejor día para visitar."
}
```

---

## ⚡ FASE 3: Sistema de Alertas Inteligente (Semana 5)

### 3.1 Agente de Monitoreo y Alertas

```javascript
// agents/alert-monitor-agent.js
class AlertMonitorAgent {
  constructor() {
    this.thresholds = {
      amarillo: 0.60,  // Precaución
      naranja: 0.75,   // Saturado
      rojo: 0.85       // Crítico
    };
  }

  async monitorContinuously() {
    setInterval(async () => {
      const municipios = await this.getAllMunicipios();

      for (const muni of municipios) {
        const current = await this.getCurrentSaturation(muni);
        const predicted = await this.getPredictedSaturation(muni, '+2hours');

        // Detectar picos
        if (this.isAlertWorthy(current, predicted, muni)) {
          await this.sendAlert(muni, current, predicted);
        }
      }
    }, 30 * 60 * 1000); // Cada 30 minutos
  }

  async sendAlert(muni, current, predicted) {
    // 1. Generar mensaje con Claude
    const message = await this.generateAlertMessage(muni, current, predicted);

    // 2. Enviar por múltiples canales
    await Promise.all([
      this.sendEmail(message),
      this.sendTelegram(message),
      this.sendWebPush(message),
      this.updateDashboard(message)
    ]);
  }

  async generateAlertMessage(muni, current, predicted) {
    const prompt = `
      Alerta de saturación turística:

      Municipio: ${muni.name}
      Saturación actual: ${(current * 100).toFixed(0)}%
      Predicción en 2h: ${(predicted * 100).toFixed(0)}%

      Genera un mensaje de alerta claro y accionable para:
      - Turistas que planean visitar
      - Residentes locales
      - Autoridades municipales

      Incluye recomendaciones específicas.
    `;

    const response = await claude.messages.create({
      model: 'claude-3-5-haiku-20241022', // Más rápido para alertas
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.content[0].text;
  }
}
```

**Ejemplo de alerta**:
```
🚨 ALERTA NARANJA: Lloret de Mar

Saturación actual: 87% (CRÍTICO)
Predicción 2h: 92%

⚠️ Para turistas:
- Evitar zonas céntricas entre 12h-18h
- Considerar municipios cercanos: Tossa (45%), Blanes (52%)

🏛️ Para autoridades:
- Activar plan de gestión de flujos
- Reforzar transporte público

📅 Mejor momento para visitar: Mañana martes 8h-11h (previsto 34%)
```

---

## 🔄 FASE 4: Ciclo de Actualización Automática (Semana 6)

### 4.1 Pipeline de Datos Automático

```yaml
# .github/workflows/update-tourism-data.yml
name: Update Tourism Data

on:
  schedule:
    - cron: '0 */6 * * *'  # Cada 6 horas
  workflow_dispatch:        # Manual trigger

jobs:
  update-data:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install

      - name: Run scraper agents
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          node agents/tourism-data-scraper.js
          node agents/hotel-occupation-agent.js
          node agents/event-detector-agent.js

      - name: Update ML predictions
        run: python ml/update_predictions.py

      - name: Generate new current.json
        run: node scripts/generate-from-topojson.js

      - name: Deploy to Vercel
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: |
          vercel --prod --token $VERCEL_TOKEN

      - name: Send summary report
        run: node agents/send-daily-report.js
```

---

## 📊 FASE 5: Dashboard Avanzado con IA (Semana 7)

### 5.1 Chatbot Integrado

```javascript
// components/TourismChatbot.jsx
export function TourismChatbot() {
  const [messages, setMessages] = useState([]);

  async function handleUserMessage(userMessage) {
    // Contexto actual del mapa
    const mapContext = {
      currentView: map.getCenter(),
      visibleMunicipios: getVisibleMunicipios(),
      selectedMunicipio: selectedMuni
    };

    // Enviar a Claude con contexto
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: userMessage,
        context: mapContext,
        history: messages
      })
    });

    const aiResponse = await response.json();

    // Si Claude sugiere un municipio, moverlo en el mapa
    if (aiResponse.suggested_location) {
      map.flyTo(aiResponse.suggested_location);
      highlightMunicipio(aiResponse.suggested_municipio);
    }

    return aiResponse.text;
  }

  return (
    <ChatInterface
      onMessage={handleUserMessage}
      placeholder="Pregunta: '¿Cuál es el mejor día para visitar Cadaqués?'"
    />
  );
}
```

**Ejemplos de conversación**:
```
Usuario: "Quiero ir a la playa este fin de semana pero sin muchedumbre"

IA: "Te recomiendo la Costa Brava norte este fin de semana. Análisis:

🟢 L'Escala - 34% saturación (IDEAL)
   - Playa tranquila, clima soleado 22°C
   - Sin eventos especiales

🟡 Cadaqués - 58% saturación (MODERADO)
   - Algo concurrido por festividad local
   - Mejor visitar por la mañana

🔴 Lloret de Mar - 91% saturación (EVITAR)
   - Concierto masivo sábado noche

¿Te muestro más opciones en el mapa?"

Usuario: "Sí, muéstrame L'Escala"

IA: [Mueve el mapa a L'Escala y abre popup con detalles]
```

---

### 5.2 Visualizaciones IA-Enhanced

```javascript
// components/AIInsightsPanel.jsx
export function AIInsightsPanel({ municipio }) {
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    async function generateInsights() {
      const response = await fetch(`/api/insights/${municipio.id}`);
      const data = await response.json();

      // Claude analiza patrones y genera insights
      const aiInsights = await analyzeWithClaude(data);
      setInsights(aiInsights);
    }

    generateInsights();
  }, [municipio]);

  return (
    <div className="insights-panel">
      <h3>🤖 Análisis IA: {municipio.name}</h3>

      <InsightCard
        title="Patrón detectado"
        text={insights.pattern}
        icon="📊"
      />

      <InsightCard
        title="Predicción semanal"
        text={insights.prediction}
        icon="🔮"
      />

      <InsightCard
        title="Recomendación"
        text={insights.recommendation}
        icon="💡"
      />

      <TrendChart data={insights.historical} />
    </div>
  );
}
```

**Ejemplo de insights**:
```
📊 Patrón detectado:
"Barcelona muestra un patrón inusual: los martes tienen 23% más saturación que la media. Esto coincide con ofertas de compañías aéreas low-cost que operan Lunes-Martes."

🔮 Predicción semanal:
"Próximos 7 días: Pico el sábado 23 (95%) por Black Friday. Mejor visita: lunes 25 (41%). Confianza: 89%"

💡 Recomendación:
"Si visitas el fin de semana, evita La Rambla 14h-20h. Alternativas: Gràcia (52%), Sant Andreu (38%). Transporte: Metro L3 menos saturado que L1."
```

---

## 🔧 Stack Tecnológico Completo

### Backend
- **Node.js + Express**: API REST
- **Python + FastAPI**: Modelo ML
- **PostgreSQL**: Base de datos histórica
- **Redis**: Cache de predicciones

### Agentes IA
- **Anthropic Claude 3.5 Sonnet**: Análisis complejo, generación de insights
- **Claude 3.5 Haiku**: Alertas rápidas, clasificación eventos
- **Cheerio**: Web scraping
- **Puppeteer**: Scraping dinámico

### Machine Learning
- **Scikit-learn**: Modelo de regresión
- **Pandas**: Procesamiento de datos
- **NumPy**: Cálculos numéricos

### Frontend
- **Vite + Vanilla JS**: Bundle ultra-rápido
- **Leaflet.js**: Mapas interactivos
- **Chart.js**: Gráficos de tendencias
- **TailwindCSS**: Diseño responsivo

### DevOps
- **GitHub Actions**: CI/CD automático
- **Vercel**: Hosting + Edge Functions
- **Sentry**: Monitoreo de errores

---

## 📈 Roadmap de Implementación

### ✅ **Semana 1-2: Agentes de Recopilación**
- [ ] Configurar Anthropic Claude API
- [ ] Implementar TourismDataScraper
- [ ] Implementar HotelOccupationAgent
- [ ] Implementar EventDetectorAgent
- [ ] Enriquecer 100+ municipios
- [ ] Crear base de datos PostgreSQL

### ✅ **Semana 3-4: Machine Learning**
- [ ] Recopilar datos históricos INE/IDESCAT
- [ ] Entrenar modelo de predicción
- [ ] Crear API de predicciones
- [ ] Integrar pronóstico del tiempo
- [ ] Testing con datos reales

### ✅ **Semana 5: Sistema de Alertas**
- [ ] Implementar AlertMonitorAgent
- [ ] Configurar Email/Telegram/Push notifications
- [ ] Dashboard de alertas en tiempo real
- [ ] Testing de umbrales

### ✅ **Semana 6: Automatización**
- [ ] GitHub Actions workflow
- [ ] Cron jobs cada 6h
- [ ] Deploy automático Vercel
- [ ] Monitoreo y logging

### ✅ **Semana 7: Dashboard Avanzado**
- [ ] Chatbot con Claude
- [ ] Panel de insights IA
- [ ] Gráficos de tendencias
- [ ] Comparativa municipios
- [ ] Mobile responsive

### ✅ **Semana 8: Optimización y Lanzamiento**
- [ ] Performance optimization
- [ ] Testing end-to-end
- [ ] Documentación completa
- [ ] Lanzamiento beta
- [ ] Feedback de usuarios

---

## 💰 Costos Estimados

### APIs y Servicios
- **Anthropic Claude API**: ~$50-100/mes (con cache)
- **OpenWeather API**: Gratuito hasta 1000 llamadas/día
- **Vercel Pro**: $20/mes (necesario para cron jobs)
- **PostgreSQL (Supabase)**: Gratuito hasta 500MB
- **Total**: **~$70-120/mes**

### Optimizaciones para reducir costos:
1. **Prompt Caching**: Reutilizar contexto común (70% ahorro)
2. **Batch Processing**: Procesar municipios en lotes
3. **Haiku para tareas simples**: 10x más barato que Sonnet
4. **Edge Caching**: Vercel Edge para respuestas rápidas

---

## 🎯 Métricas de Éxito

### KPIs Técnicos
- ✅ Cobertura: >80% municipios con datos reales
- ✅ Precisión ML: R² > 0.85 en predicciones
- ✅ Latencia: <500ms tiempo de respuesta API
- ✅ Uptime: >99.5% disponibilidad

### KPIs de Usuario
- ✅ Engagement: >5 min tiempo promedio sesión
- ✅ Retorno: >40% usuarios que vuelven
- ✅ Satisfacción: >4.5/5 rating
- ✅ Adopción: 1000+ usuarios activos/mes

---

## 🚀 Próximo Paso Inmediato

**Comenzar AHORA con Fase 1.1**:

```bash
# 1. Instalar dependencias
npm install @anthropic-ai/sdk cheerio

# 2. Configurar API key
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env

# 3. Crear primer agente
mkdir -p agents
touch agents/tourism-data-scraper.js

# 4. Ejecutar primera recopilación
node agents/tourism-data-scraper.js --municipios=50 --test
```

**Resultado esperado en 1 día**:
- 50 municipios enriquecidos automáticamente
- Datos validados por Claude
- Integración en `real-tourism-data.js`
- Mapa actualizado con mejor cobertura

---

## 📞 Siguiente Acción

¿Empezamos con el **Agente de Scraping** (Fase 1.1) o prefieres ajustar el plan?

Opciones:
**A)** Empezar inmediatamente con tourism-data-scraper.js
**B)** Primero configurar la base de datos PostgreSQL
**C)** Ajustar alguna fase del plan
**D)** Hacer un prototipo rápido del chatbot primero
