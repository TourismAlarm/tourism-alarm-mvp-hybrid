# 🚨 Tourism Alarm Catalunya

Mapa de **presión turística de los 947 municipios de Catalunya**, calculado a
partir de datos oficiales del IDESCAT. Cada municipio se colorea según cuánta
capacidad turística soporta su territorio y cuánta de esa capacidad está
realmente ocupada en el mes que se consulte.

![Coropleta de Catalunya con la costa en rojo y el interior en verde](https://img.shields.io/badge/municipios-947%2F947-brightgreen)

## ¿Qué muestra el mapa?

- **Coropleta de los 947 municipios**, sin huecos: cada polígono tiene datos.
- **Selector de mes**: la intensidad se recalcula para los 12 meses del año con
  la estacionalidad real de cada marca turística. En agosto la costa se pone en
  rojo; en enero solo Barcelona y el Pirineo mantienen presión.
- **Ranking de los 8 municipios con más presión** en el mes seleccionado; al
  hacer clic el mapa hace zoom sobre el municipio.
- **Ficha por municipio**: plazas hoteleras, de camping y de turismo rural,
  plazas por km², superficie y comarca.

## Arranque rápido

```bash
npm install
npm run dev        # http://localhost:5173
```

Los datos del mapa (`public/data/current.json`) están versionados, así que la
aplicación funciona sin ejecutar ningún script previo.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Regenera los datos y compila a `dist/` |
| `npm run preview` | Sirve el build de producción |
| `npm run data:build` | Regenera `public/data/current.json` desde los CSV del IDESCAT |
| `npm run data:verify` | Comprueba que los datos cubren los 947 municipios (`npm run test:data`) |

## De dónde salen los datos

Todo el contenido del mapa procede de ficheros oficiales que están en el
repositorio, en `dataidescat-csv/Capacidad hotelera/`:

| Fuente | Fichero | Qué aporta |
| --- | --- | --- |
| IDESCAT t6031 (2023) | `t6031mun202300.csv` | Plazas hoteleras por municipio |
| IDESCAT t6036 (2024) | `t6036mun202400.csv` | Plazas de camping por municipio |
| IDESCAT t6039 (2024) | `t6039mun202400.csv` | Plazas de turismo rural por municipio |
| IDESCAT turhot | `idescat-turhot-*.csv` | Pernoctaciones mensuales por marca turística (2023-2025) |
| ICGC / IDESCAT | `public/geojson/cat-municipis.json` | Límites municipales, comarca, provincia y superficie |

## Cómo se calcula la intensidad

No hay población oficial por municipio en el repositorio, así que el índice se
apoya en dos magnitudes que sí son verificables:

1. **Densidad** — plazas turísticas por km². Es lo que mide la saturación real
   del territorio (Salou: 2.452 plazas/km²).
2. **Volumen** — plazas turísticas totales. Evita que Barcelona quede
   infravalorada por su superficie (82.470 plazas).

Ambas se escalan logarítmicamente contra anclas **absolutas** —no contra el
máximo observado— para que el índice siga significando lo mismo cuando el
IDESCAT publique datos nuevos:

```
intensidad = 0,62 × log(plazas/km², 1→800) + 0,38 × log(plazas totales, 50→25.000)
```

La **estacionalidad** se aplica antes de escalar, como tasa de ocupación: las
plazas existen todo el año, lo que cambia es cuántas están ocupadas. La
ocupación de cada mes sale de las pernoctaciones reales de su marca turística,
normalizadas contra su propio mes punta:

```
ocupación(marca, mes) = pernoctaciones(mes) / pernoctaciones(mes punta) × 0,85
```

Por eso Val d'Aran alcanza su máximo en enero y febrero (esquí) mientras la
Costa Daurada lo hace en agosto.

Cada municipio se asigna a una de las **9 marcas turísticas oficiales** según su
comarca (`scripts/lib/comarques.js`). Barcelona ciudad es marca propia, igual
que en las estadísticas del IDESCAT.

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

## Estructura

```
src/
  main.js                  arranque, panel lateral, selector de mes
  data/fetchData.js        carga con respaldo y validación de formato
  map/municipalityLayer.js coropleta Leaflet + paleta + fichas
  style.css                estilos
scripts/
  build-map-data.js        genera public/data/current.json
  verify-map-data.js       valida cobertura y coherencia de los datos
  lib/comarques.js         comarcas, provincias y marcas turísticas
  lib/idescat-csv.js       lectores de los CSV del IDESCAT
public/
  data/current.json        datos que consume el mapa (versionados)
  data/last-good.json      copia de respaldo
  geojson/cat-municipis.json  geometría de los 947 municipios
```

### Sobre los códigos de municipio

El TopoJSON guarda el código IDESCAT como número, así que los municipios de la
provincia de Barcelona pierden el cero inicial (`080193` → `80193`). Todo el
código normaliza los identificadores con `normalizeId()` antes de cruzarlos;
saltarse ese paso deja el mapa sin colorear.

## Pipelines auxiliares

`agents/` y el resto de `scripts/` contienen experimentos de enriquecimiento con
LLM y snapshots diarios. **No alimentan el mapa**: la aplicación solo lee
`public/data/current.json`, que genera `scripts/build-map-data.js`.

## Licencia

MIT
