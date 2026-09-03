# Tourism Alarm — recolección de datos

Recoge datos turísticos de fuentes públicas y los deja en la cola de revisión
de Supabase. Jordi los aprueba o rechaza desde la página privada; solo lo
aprobado llega al mapa.

## Cuándo usar esta skill

- El cron la dispara sola (ver `jobs.json` abajo).
- Cuando Jordi pida "lanza los recolectores" o "mira si hay datos nuevos".
- Cuando Jordi pida "publica lo aprobado" → ese es el paso 3, aparte.

## Regla que no se salta

**Ni tú ni ningún script inventáis cifras.** Los recolectores leen fuentes y
copian lo que dicen. Si una fuente no publica un dato, ese dato no existe: no
se estima, no se rellena, no se deduce "por contexto".

Esto no es una preferencia de estilo. La base de datos rechaza cualquier señal
medida que no traiga el enlace a su fuente, así que un intento de rellenar
huecos falla con error, no se cuela.

Si te toca ayudar con texto (una agenda de fiestas en HTML desordenado, por
ejemplo), tu trabajo es **normalizar lo que pone**, no completar lo que falta.

## Cómo ejecutarla

Desde la carpeta del proyecto:

```powershell
powershell -File <ruta>\openclaw\tourism-alarm\run-collectors.ps1
```

El script:

1. comprueba que hay `.env` con las credenciales,
2. mira si Jordi ha pedido alguna ejecución manual desde la página de revisión,
3. lanza los recolectores activos,
4. deja las señales nuevas en estado `pending`,
5. registra la ejecución en `agent_runs`, con error incluido si algo falla.

Códigos de salida: `0` todo bien, `1` algún recolector falló. En caso de fallo,
el detalle queda en `agent_runs` y se ve en la página de revisión — no hace
falta que lo copies al chat, basta con avisar de que hubo un error.

## Comandos

| Para | Comando |
| --- | --- |
| Comprobar conexión (primera vez) | `node scripts/collect/check.js` |
| Ejecutar todos los recolectores | `node scripts/collect/run-all.js` |
| Uno solo | `node scripts/collect/run-all.js --only=<fuente>` |
| Ensayo sin escribir | `node scripts/collect/run-all.js --dry-run` |
| Publicar lo aprobado en el mapa | `node scripts/publish-snapshot.js` |

## Programación (cron/jobs.json)

Dos pasadas al día. La de la mañana es la que importa: recoge antes de que la
gente decida a qué playa va.

```json
{
  "id": "tourism-alarm-collect",
  "cron": "0 7,14 * * *",
  "timezone": "Europe/Madrid",
  "message": "Ejecuta la skill tourism-alarm: lanza los recolectores y dime en una línea cuántas señales han quedado pendientes de revisión."
}
```

Si Jordi quiere que se atiendan rápido las peticiones manuales de la página,
añadir una pasada corta:

```json
{
  "id": "tourism-alarm-manual",
  "cron": "*/20 * * * *",
  "timezone": "Europe/Madrid",
  "message": "Ejecuta scripts/collect/run-all.js solo si hay peticiones manuales pendientes; si no hay, no hagas nada y no me avises."
}
```

## Credenciales

A diferencia de otras skills de este sistema, aquí la clave **no va dentro del
script**: vive en el `.env` del proyecto, que está en `.gitignore`.

El motivo es que esta clave es la `service_role` de Supabase, que salta todas
las políticas de seguridad. Si se incrusta en un script que además está en un
repositorio de git, acaba publicada. En `.env` se queda en el disco.

```
SUPABASE_URL=https://dsscahrsdwnsznyknkzb.supabase.co
SUPABASE_SERVICE_KEY=<service_role, del panel de Supabase>
```

## Qué NO hace esta skill

- No publica en el mapa. Eso es `publish-snapshot.js`, y solo después de que
  Jordi apruebe.
- No usa el navegador. Los recolectores son `fetch` a APIs y páginas estáticas,
  que es más rápido y más barato que pasar cada paso por el modelo. Si alguna
  fuente necesita login o JavaScript pesado, eso sí pediría el browser nativo,
  pero se decide fuente por fuente.
- No borra ni edita señales ya revisadas.
