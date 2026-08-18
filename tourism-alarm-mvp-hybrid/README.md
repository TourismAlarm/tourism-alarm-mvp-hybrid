# 🚨 Tourism Alarm Catalunya

**¿Cuánta gente hay hoy y mañana en cada municipio de Catalunya, y a qué playa
conviene ir?** Eso es lo único que responde la aplicación. Se abre, se mira, se
decide.

## Qué muestra

- **Hoy / Mañana**: dos pestañas, horizonte de 48 horas. Nada más.
- **Coropleta de los 947 municipios**, coloreada por la afluencia prevista de
  ese día.
- **🏖️ Mejores playas**: los municipios costeros ordenados por buen tiempo y
  poca gente. Es la respuesta directa a "¿a qué playa voy?".
- **Más saturados**: dónde no ir ese día.
- **Ficha por municipio**: previsión meteorológica, afluencia prevista y de qué
  se compone.

## Arranque rápido

```bash
npm install
npm run dev        # http://localhost:5173
```

Los datos (`public/data/current.json`) están versionados: la aplicación
funciona sin ejecutar ningún script previo. La previsión meteorológica se pide
desde el navegador al abrir la página.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Genera datos → verifica → promueve respaldo → compila |
| `npm run data:build` | Regenera `public/data/current.json` desde los CSV del IDESCAT |
| `npm run data:verify` | Comprueba cobertura, costa y coherencia (`npm run test:data`) |
| `npm run data:promote` | Copia `current.json` a `last-good.json` |

## Qué es dato y qué es estimación

Esto importa: la aplicación mezcla una base estadística sólida con capas
modeladas, y conviene saber cuál es cuál.

| Capa | Origen | Solidez |
| --- | --- | --- |
| **Capacidad turística** por municipio | IDESCAT: plazas hoteleras (t6031, 2023), camping (t6036, 2024) y turismo rural (t6039, 2024) | 🟢 Dato oficial, 947/947 municipios |
| **Estacionalidad** por marca turística | IDESCAT turhot: 207 periodos mensuales de pernoctaciones (2023-2025) | 🟢 Dato oficial |
| **Geometría, comarca, superficie** | ICGC/IDESCAT (TopoJSON) | 🟢 Dato oficial |
| **Municipios costeros** | Deducido de la topología (ver abajo) | 🟢 70 municipios, verificado |
| **Meteorología de hoy y mañana** | Open-Meteo, en vivo desde el navegador | 🟢 Previsión real |
| **Día de la semana y festivos** | Modelo propio; festivos de Catalunya con Pascua calculada | 🟡 Modelo documentado |
| **Turismo de día (excursionistas)** | Modelo propio por distancia a núcleos urbanos | 🟠 Estimación |

### La limitación importante

El IDESCAT solo publica **plazas de alojamiento**, es decir, turismo que
pernocta. Para "¿a qué playa voy hoy?" eso se queda corto: Montgat o
Castelldefels apenas tienen hoteles y un sábado de agosto están llenas de gente
que va y vuelve desde Barcelona en el mismo día.

Si solo mirásemos plazas hoteleras, esas playas saldrían como vacías, que es
justo lo contrario de la realidad. Por eso hay una capa de **turismo de día**
estimada a partir de la distancia a los grandes núcleos urbanos. Es un modelo,
no una medición, y la ficha de cada municipio muestra las dos cifras por
separado para que se vea qué parte es qué:

```
Pernocta 100% (IDESCAT) · excursión 21% (estimado)
```

Tampoco hay **población municipal** en el repositorio, así que el índice usa
densidad de plazas por km² en lugar de plazas por habitante, que sería el
indicador estándar de presión turística.

## Cómo se calcula la afluencia

```
afluencia = máx( turismo que pernocta , turismo de día )
```

**Turismo que pernocta** — capacidad real modulada por la ocupación esperada:

```
ocupación(día) = curva estacional de la marca  ×  factor de calendario  ×  factor meteorológico

intensidad = 0,62 × log(plazas/km²  × ocupación, 1→800)
           + 0,38 × log(plazas totales × ocupación, 50→25.000)
```

Las escalas logarítmicas van contra anclas **absolutas**, no contra el máximo
observado, para que el índice siga significando lo mismo cuando el IDESCAT
publique datos nuevos.

**Curva estacional**: los valores mensuales de pernoctaciones se anclan a
mediados de mes y se interpolan de forma continua, cerrando el círculo entre
diciembre y enero. Por eso Val d'Aran alcanza su máximo en enero y febrero
(esquí) mientras la Costa Daurada lo hace en agosto.

**Factor de calendario**: pesos por día de la semana normalizados para que la
media semanal sea exactamente 1 (no infla ni desinfla la ocupación anual del
IDESCAT), más los festivos de Catalunya. La Pascua se calcula con el algoritmo
de Meeus en vez de escribirse a mano, así que el calendario no caduca.

**Factor meteorológico**: un día de sol y 28° llena las playas; uno de lluvia y
viento las vacía. Sale de la previsión diaria de Open-Meteo.

**Turismo de día**: decae exponencialmente con la distancia a Barcelona
(dominante), Tarragona-Reus y Girona, y se modula con la misma estacionalidad y
el mismo tiempo. En enero nadie va a la playa aunque viva al lado.

### Niveles

| Nivel | Rango | Color |
| --- | --- | --- |
| Crítica | > 80 % | 🔴 `#c0272d` |
| Alta | 60-80 % | 🟠 `#f2874a` |
| Media | 40-60 % | 🟡 `#f7d060` |
| Moderada | 20-40 % | 🟢 `#b9dc9a` |
| Baja | < 20 % | ⚪ `#e6f0e2` |

La mayor parte de Catalunya sale en el nivel más bajo, y es correcto: la
capacidad turística está muy concentrada en el litoral y en el Pirineo.

## Detección de municipios costeros

No hay ningún campo "es costero" en el TopoJSON, así que se deduce en dos pasos
(`scripts/lib/coastline.js`):

1. Un arco que pertenece a **un solo** municipio es frontera exterior de
   Catalunya. Los compartidos por dos son fronteras interiores.
2. De esas fronteras exteriores, la costa es la **envolvente oriental** del
   territorio. La frontera francesa se descarta porque queda al norte de
   Portbou (42,44 N), el punto costero más septentrional.

La distancia se mide **punto a segmento**, no punto a vértice: es lo que hace
que Cambrils cuente como costero, porque su litoral queda retranqueado respecto
al saliente de Salou y el vértice más cercano está a 7 km.

Resultado: **70 municipios costeros**, sin falsos positivos ni ausencias.
`npm run data:verify` lo comprueba en cada build.

## Estructura

```
src/
  main.js                  arranque, panel, pestañas hoy/mañana
  lib/pressure.js          fórmula de intensidad (la comparten build y navegador)
  lib/calendar.js          festivos de Catalunya y día de la semana
  data/fetchData.js        carga con respaldo y validación de formato
  data/weather.js          cliente de Open-Meteo y derivadas
  map/municipalityLayer.js coropleta Leaflet
  style.css                estilos
scripts/
  build-map-data.js        genera public/data/current.json
  verify-map-data.js       valida cobertura, costa y coherencia
  promote-fallback.js      current.json → last-good.json
  lib/comarques.js         comarcas, provincias y marcas turísticas
  lib/idescat-csv.js       lectores de los CSV del IDESCAT
  lib/coastline.js         detección de municipios costeros
public/
  data/current.json        datos que consume el mapa (versionados)
  data/last-good.json      última versión que pasó la verificación
  geojson/cat-municipis.json  geometría de los 947 municipios
```

### Sobre los códigos de municipio

El TopoJSON guarda el código IDESCAT como número, así que los municipios de la
provincia de Barcelona pierden el cero inicial (`080193` → `80193`). Todo el
código normaliza los identificadores con `normalizeId()` antes de cruzarlos;
saltarse ese paso deja el mapa sin colorear.

## Siguiente paso

Los agentes de `agents/` (enriquecimiento con LLM, snapshots diarios) **no
alimentan el mapa** todavía: la aplicación solo lee `public/data/current.json`.
La idea es que más adelante recopilen datos diarios reales de ocupación y
sustituyan las capas modeladas —el factor de calendario y el turismo de día—
por mediciones.

## Licencia

MIT
