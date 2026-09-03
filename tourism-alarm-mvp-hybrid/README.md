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
- **Buscador de municipio**: son 947 y por el mapa solo se llega a los que se
  ven. Es la vía para "¿cómo está mi pueblo hoy?" — se escribe el nombre (sin
  importar acentos) y el mapa se sitúa encima con su ficha abierta.
- **Ficha por municipio**: previsión meteorológica, afluencia prevista y de qué
  se compone.

### En el móvil

La pregunta se hace desde el teléfono, así que el panel es una hoja inferior
con dos posiciones: replegada deja el mapa a la vista y ya muestra el día y el
ranking de playas; el asa la despliega para leerla entera. Al elegir un
municipio —del ranking o del buscador— se repliega sola y el mapa hace zoom
sobre él.

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
| `npm run data:official` | Descarga ocupación del INE y población del IDESCAT |
| `npm run data:probe` | Sondea las fuentes oficiales y guarda sus respuestas |
| `npm run data:promote` | Copia `current.json` a `last-good.json` |
| `npm test` | Todas las pruebas (INE, señales, publicación, datos) |
| `npm run collect:check` | Comprueba credenciales y permisos de Supabase |
| `npm run collect` | Lanza los recolectores |
| `npm run publish` | Publica en el snapshot lo que hayas aprobado |

## Qué es dato y qué es estimación

Esto importa: la aplicación mezcla una base estadística sólida con capas
modeladas, y conviene saber cuál es cuál.

| Capa | Origen | Solidez |
| --- | --- | --- |
| **Capacidad turística** por municipio | IDESCAT: plazas hoteleras (t6031), camping (t6036) y turismo rural (t6039) | 🟢 Dato oficial, 947/947 municipios |
| **Ocupación** por municipio | INE, Encuesta de Ocupación: grado de ocupación por puntos turísticos (75198 hoteles, 75196 campings, 75193 apartamentos) | 🟢 Medición oficial, ~30 municipios |
| **Ocupación** por marca turística | INE, las mismas encuestas por zonas turísticas (2013, 2049, 2005, 2022) | 🟢 Medición oficial, 9/9 marcas |
| **Población** por municipio | IDESCAT, padró municipal d'habitants | 🟢 Dato oficial, 947/947 |
| **Geometría, comarca, superficie** | ICGC/IDESCAT (TopoJSON) | 🟢 Dato oficial |
| **Municipios costeros** | Deducido de la topología (ver abajo) | 🟢 70 municipios, verificado |
| **Meteorología de hoy y mañana** | Open-Meteo, en vivo desde el navegador | 🟢 Previsión real |
| **Día de la semana y festivos** | Modelo propio; festivos de Catalunya con Pascua calculada | 🟡 Modelo documentado |
| **Turismo de día (excursionistas)** | Modelo propio por distancia a núcleos urbanos | 🟠 Estimación |

### La ocupación es una medición, no un proxy

Hasta hace poco la ocupación se **deducía**: se cogían las pernoctaciones
mensuales del IDESCAT, se normalizaban contra el mes punta de cada marca y se
multiplicaban por 0,85. Funcionaba, pero la forma de la curva dependía de que
las pernoctaciones se movieran igual que la ocupación, y ese 0,85 era una
constante puesta a mano.

El INE publica el **grado de ocupación medido** cada mes, y ahora es eso lo que
usa el mapa.

#### Ojo: el grado de ocupación solo cuenta lo abierto

Es la trampa de esta estadística. El INE mide la ocupación **sobre los
establecimientos abiertos ese mes**. En enero, Salou tiene casi toda su planta
hotelera cerrada y el INE dice 24,7%: no significa que Salou esté a un cuarto,
sino que los pocos hoteles que abren lo están. Usar esa cifra tal cual ponía a
Salou al 91% en enero.

La corrección la publica el propio INE, en la misma tabla: *Número de plazas
estimadas* es la capacidad abierta de cada mes.

```
afluencia(mes) = ocupación(mes) × plazas abiertas(mes) / plazas del mes punta
```

Los dos términos son medición del INE; no se añade ninguna constante. En
`data/official/occupancy.json` se guardan también los dos por separado
(`brands_raw`, `municipalities_raw`) para poder revisar la corrección sin
volver a descargar nada.

Cada municipio recibe su curva por este orden:

1. **La suya**, si el INE lo trata como punto turístico. Son los destinos que
   más importan: Salou, Lloret de Mar, Barcelona, Sitges, Cambrils, Blanes,
   Roses, Castell-Platja d'Aro, Sant Pere Pescador, Torroella de Montgrí,
   Malgrat de Mar, Castelldefels, Girona, Tarragona, Vielha e Mijaran…
2. **La de su marca turística**, mezclando hotel, camping y turismo rural
   según las plazas que ese municipio tiene de cada tipo. Un pueblo de
   campings deja de seguir la ocupación de los hoteles.
3. La estacionalidad de las pernoctaciones, solo como respaldo si el fichero
   de datos oficiales no está descargado.

La ficha de cada municipio dice cuál de los tres le ha tocado.

Los datos viven en `data/official/occupancy.json`, versionado, y los refresca
el workflow **Datos oficiales** (`npm run data:official`). El mapa no depende
de que el INE responda en cada despliegue.

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

### Lo que sigue sin poder medirse

- **Afluencia de playa en tiempo real.** Salou y Lloret de Mar tienen sensores
  y publican la ocupación de sus playas en sus propias webs, pero ninguno
  ofrece una API abierta. El canal de datos abiertos del AMB tiene el campo
  `ocupacio` para 45 playas metropolitanas y lo devuelve
  `SENSE_INFORMACIO` en todas: existe el hueco, no el dato.
- **Turistas por municipio a partir de móviles.** El INE los publica
  (tablas 52048 y 53464), pero la API responde *«No puede mostrarse por
  restricciones de volumen»* y el filtro por municipio no está disponible en
  esas tablas. Es la vía más prometedora para medir el turismo de día; hoy
  requiere descargar el fichero completo a mano.

Mientras tanto el turismo de día sigue siendo un modelo, y se muestra por
separado en la ficha para que se vea qué parte es medición y qué parte no.

La **población** ya no falta: entra del padró municipal del IDESCAT y la ficha
enseña plazas por habitante, el indicador estándar de presión turística. El
índice del mapa mantiene densidad y volumen, que están calibrados contra
anclas absolutas; la población queda disponible para recalibrarlo cuando se
decida, no de tapadillo.

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
  main.js                  arranque, panel, pestañas hoy/mañana, buscador
  lib/pressure.js          fórmula de intensidad (la comparten build y navegador)
  lib/calendar.js          festivos de Catalunya y día de la semana
  data/fetchData.js        carga con respaldo y validación de formato
  data/weather.js          cliente de Open-Meteo y derivadas
  map/municipalityLayer.js coropleta Leaflet
  lib/signals.js           cómo un dato real corrige una estimación
  review.js                lógica de la página de revisión
  style.css                estilos
openclaw/tourism-alarm/    skill lista para OpenClaw (SKILL.md + .ps1)
revisar.html               página privada de revisión (login Supabase)
scripts/
  official/fetch.js        descarga ocupación del INE y población del IDESCAT
  official/probe.js        sondeo de fuentes: guarda lo que devuelven de verdad
  lib/ine.js               lectores de la API Tempus3 del INE
  collect/lib.js           marco de recolectores
  collect/run-all.js       orquestador que llama el cron
  collect/check.js         comprobación de conexión
  collect/template.js      plantilla para una fuente nueva
  publish-snapshot.js      aprobadas → snapshot
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

## Señales: cómo un dato real corrige una estimación

El mapa parte de una base estimada. Cuando un agente trae una medición de
verdad, esa señal la corrige — pero sin que se pierda de vista qué parte es
medición y qué parte sigue siendo modelo.

**Reglas** (`src/lib/signals.js`, 26 pruebas en `npm run test:signals`):

1. Una ocupación **medida sustituye a la ocupación estimada**, no a la
   intensidad final. Así la fórmula sigue aplicando densidad y volumen igual
   para todos y las cifras siguen siendo comparables.
2. Una medición **envejece**. La de esta mañana manda del todo; a partir de
   6 h se va mezclando con la base, y a las 48 h conserva un peso mínimo. Una
   medición de anteayer sobre hoy no es una medición, es un pronóstico.
3. Los **eventos suman**, no sustituyen, y con tope (+0,35 como mucho entre
   todos). Un concierto se añade a lo que ya hubiera.
4. **Prioridad**: medido > derivado > estimado. A igual método, gana el más
   reciente.
5. Cada resultado dice de qué está hecho: 🟢 Medido, 🟡 Mixto, ⚪ Estimado, con
   enlace a la fuente.

### Absoluto frente a "lo normal"

El color del mapa mide **saturación absoluta**. Si un agente mide que Salou
está al 30% cuando el modelo esperaba 74%, el municipio *sigue* saliendo en
rojo: 30% de Salou son 736 plazas ocupadas por km², más que muchos pueblos al
100%. Para decidir a qué playa ir, lo que importa es que estará lleno.

"Está más vacío de lo normal" es una pregunta distinta, y se responde aparte,
en la ficha:

```
Ocupación medida 30% · por debajo de lo normal (el modelo esperaba 74%)
🟢 Medido — ajuntament-salou
```

Mezclar las dos en un solo número estropearía las dos.

### Límite conocido de la escala, y la decisión pendiente

Los destinos más densos **saturan el índice**. Salou (2.452 plazas/km²) llega
al tope del término de densidad enseguida, así que entre "Salou al 70%" y
"Salou al 100%" el color apenas cambia.

Con la ocupación ya medida se ve el otro extremo del mismo problema. En enero,
la Costa Daurada tiene un 3% de afluencia real —el 24% de ocupación que publica
el INE, sobre el 14% de la planta que abre— y el índice todavía pinta a Salou
al 59%:

| Municipio | Ocupación enero | Índice enero | Ocupación agosto | Índice agosto |
| --- | --- | --- | --- | --- |
| Salou | 3% | 59% | 87% | 100% |
| Lloret de Mar | 6% | 57% | 90% | 98% |
| Sant Pere Pescador | 2% | 38% | 68% | 89% |
| Barcelona | 53% | 94% | 78% | 98% |
| Naut Aran | 59% | 44% | 27% | 32% |

La escala logarítmica contra anclas absolutas (1→800 plazas/km²) comprime tanto
que 74 plazas ocupadas por km² ya puntúan 0,66. El índice mide **saturación
del territorio**, no "cuánta gente hay respecto a lo normal", y con esa lectura
la cifra es coherente: Salou en enero sigue teniendo más plaza turística por km²
que casi toda Catalunya en agosto.

Aun así, para responder "¿está lleno?" probablemente convenga recalibrar, y
ahora por fin se puede: **la población está disponible** y plazas por habitante
es el indicador estándar. Es una decisión de producto —mueve todos los números
del mapa— así que se deja escrita en vez de aplicarse de tapadillo.

Subir los topes actuales no lo arregla: satura por las dos vías y a cambio baja
los municipios en nivel crítico de 22 a 10 en agosto, debilitando la alarma para
todos los demás.

## Base de datos (Supabase)

Los agentes escriben en Supabase; **el mapa público no la lee nunca** — lee el
snapshot estático. Por eso no hay ningún acceso anónimo: todas las tablas son
solo para el usuario autenticado.

| Tabla | Para qué |
| --- | --- |
| `sources` | Fuentes registradas y su solidez (`measured`/`derived`/`estimated`) |
| `signals` | Cola de señales con procedencia y estado `pending`/`approved`/`rejected` |
| `agent_runs` | Ejecuciones de agentes: alimenta el "ver a los agentes trabajar" |
| `run_requests` | Buzón para el botón "Lanzar ahora" de la página privada |

La regla "sin procedencia no hay señal" está impuesta **en el esquema**, no por
convenio:

```sql
constraint signals_need_provenance
  check (method = 'derived' or source_url is not null)
```

La base de datos rechaza una cifra medida sin enlace a su fuente, un valor
fuera de 0..1, un `method` inventado o un duplicado. No depende de que ningún
agente se porte bien.

`signals.baseline_value` guarda lo que predecía el modelo cuando llegó la
señal. Acumulado, es lo que permitirá recalibrar las capas estimadas con datos
reales en vez de con suposiciones.

## Recolección de datos con agentes

Los agentes corren en el ordenador de casa (OpenClaw), no en CI: desde una IP
doméstica los portales bloquean mucho menos, y así hay control manual.

```
agente (PC) → recoge con su fuente → Supabase: estado "pendiente"
                                          ↓
                    página privada /revisar.html: dato + enlace a la fuente
                                          ↓
                                  apruebas / rechazas
                                          ↓
              publish-snapshot.js → current.json → mapa público (estático)
```

### Puesta en marcha

```bash
cp .env.example .env          # y rellena SUPABASE_SERVICE_KEY
npm run collect:check         # comprueba credenciales, tablas y permisos
npm run collect               # lanza los recolectores
npm run publish               # lo aprobado pasa al snapshot
```

Para entrar en `/revisar.html` hace falta un usuario: Supabase → Authentication
→ Add user.

### Escribir un recolector

Copia `scripts/collect/template.js` con otro nombre en el mismo directorio;
`run-all.js` lo encuentra solo. Tiene que exportar `SOURCE_ID` y `collect()`, y
el `SOURCE_ID` debe existir en la tabla `sources`.

**Los recolectores son scripts, no turnos del LLM.** Para APIs y páginas
estáticas sale más barato, rápido y controlable. Si un LLM interviene, es solo
para normalizar texto que ya existe ("Festa Major, 12-15 agost" → fechas
estructuradas), nunca para producir un número que la fuente no diga.

### Disparo manual

La página de revisión y los agentes no pueden hablarse directamente (una está
en Vercel, los otros en casa). El botón "Lanzar ahora" deja una fila en
`run_requests`; el cron la recoge en su siguiente pasada y la marca como
atendida.

### Integración con OpenClaw

En `openclaw/tourism-alarm/` hay una skill lista: `SKILL.md` con las
instrucciones y la entrada de `cron/jobs.json`, más `run-collectors.ps1`.

A diferencia del patrón habitual de este sistema, la credencial **no va dentro
del script**: es la `service_role` de Supabase, que salta todas las políticas
de seguridad, así que vive en `.env` (ignorado por git) y no en un fichero que
pueda acabar publicado.

## Por qué los agentes de `agents/` no alimentan el mapa

`agents/daily-occupation-agent.js` le pide a Gemini que **estime** la ocupación
de cada zona. El modelo no tiene datos: se inventa la cifra y le añade una
justificación que suena creíble. En `data/daily-snapshots/latest.json` quedó
así:

```json
"occupation_percentage": 25,
"weather_impact": 0,
"reasoning": "Es noviembre, temporada baja... el clima no tiene impacto significativo."
```

Ese 25% no salió de ninguna parte, y `weather_impact: 0` porque no consultó
ningún parte meteorológico. Es el mismo mecanismo que llenó el mapa de
municipios inventados.

Esos scripts se conservan como referencia histórica, pero no tocan
`public/data/current.json`. La cola de señales existe precisamente para que eso
no pueda repetirse.

## Siguiente paso

Cuando haya semanas de mediciones acumuladas, `signals.baseline_value` permite
comparar lo que predijo el modelo con lo que pasó de verdad, y sustituir las
capas estimadas —el factor de calendario y el turismo de día— por datos.

## Licencia

MIT
