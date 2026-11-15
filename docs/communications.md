# Comunicaciones nave–Tierra

Cómo viajan los datos de la nave (`onboard-api`, puerto 4001) a tierra (`ground-api`, puerto 4000) y de ahí al dashboard en tiempo real. Todos los mensajes usan los contratos de [`packages/shared`](models.md).

## Arquitectura

```
 onboard-api (4001)                                                ground-api (4000)
┌────────────────────────────────────────────┐                  ┌──────────────────────────────────┐
│ simulador de telemetría ─┐                 │                  │                                  │
│ POST /api/check-ins ─────┼─► repos memoria │                  │  POST /api/sync/events           │
│ alertas de enlace ───────┘        │        │                  │    1. valida (modo tolerante)    │
│                                   ▼        │   HTTP POST      │    2. ¿UUID ya procesado?        │
│                         cola SyncEvent ────┼─► enlace ───────►│       → duplicate                │
│                         (outbox, FIFO)     │   simulado       │    3. aplica (last-write-wins)   │
│                              ▲     │       │                  │    4. SyncAck (modo estricto)    │
│                 reintentos   │     ▼       │◄─────────────────┤                                  │
│                 con backoff  └─ despachador│     SyncAck      │  repos memoria ──► Socket.IO ────┼──► dashboard
└────────────────────────────────────────────┘                  └──────────────────────────────────┘
```

- **Nave → tierra: solo HTTP.** Un único mecanismo de sincronización (`POST /api/sync/events`).
- **Tierra → dashboard: solo Socket.IO**, de salida. No hay sincronización por Socket.IO.
- **Todo en memoria**: se pierde al reiniciar cada proceso (ver *Limitaciones*).
- Nunca se transmiten imágenes, fotogramas ni vídeo: solo entidades del contrato.

## Flujo de sincronización

1. Un registro creado a bordo (lectura simulada, autoevaluación, alerta, tripulante) se valida en **modo estricto**, se guarda y se **encola** como `SyncEvent` con un UUID y un `sequence` asignados una sola vez.
2. El **despachador** (`sync-worker`) recorre la cola en orden de `sequence` cada `SYNC_INTERVAL_MS` (y al recuperar el enlace). Marca el evento `sending`, lo transmite a través del **simulador de enlace** y procesa el `SyncAck`:

| Resultado | Estado en la nave | ¿Reintento? |
|---|---|---|
| `accepted` | `acknowledged` | — |
| `duplicate` (tierra ya lo tenía) | `acknowledged` | — |
| `rejected` (incumple el contrato) | `failed` + `lastError` | No (el contrato lo prohíbe sin cambios) |
| Fallo de enlace, red, timeout, HTTP 5xx/429, acuse inválido | `retry_scheduled` + `nextRetryAt` | Sí, con backoff |
| Se agota `maxAttempts` | `failed` | No (reencolado manual) |
| HTTP 4xx sin acuse | `failed` | No |

3. **Backoff limitado**: `min(SYNC_BACKOFF_MAX_MS, SYNC_BACKOFF_BASE_MS × 2^(intento−1))`, sin jitter (determinista).
4. **Entrega FIFO**: un evento esperando su reintento bloquea a los posteriores, así tierra recibe las actualizaciones en orden. Además, tierra aplica **last-write-wins** por `updatedAt`: una versión antigua de una alerta nunca sobrescribe una más reciente.
5. **Idempotencia**: los reintentos conservan **UUID y `sequence`**. Si un acuse se pierde y la nave reenvía, tierra responde `duplicate` y no registra nada dos veces. Los eventos rechazados no cuentan como procesados: corregidos, pueden aceptarse con el mismo UUID.

## Simulador del enlace

| Estado | Comportamiento |
|---|---|
| `connected` | Transmite con `LINK_LATENCY_MS` de latencia artificial |
| `degraded` | Latencia + `LINK_DEGRADED_LATENCY_MS` y pérdida con probabilidad `LINK_DEGRADED_FAILURE_RATE` |
| `disconnected` | No se intenta ningún envío: los eventos permanecen `pending` en la cola local |

- **Fallos transitorios** a demanda: `POST /api/dev/link/failures { count }`.
- **Determinista**: pérdidas según un PRNG con semilla (`SIMULATION_SEED`); reloj, `sleep` y azar se inyectan en las pruebas.
- **Alertas operativas**: al desconectarse se crea una alerta `communication / warning` que queda en cola; al reconectar se resuelve y se reenvía todo lo pendiente automáticamente.
- Sin temporizadores propios ni bucles: la latencia usa un `sleep` inyectable; los únicos temporizadores (telemetría y despachador) se crean en `start()` y se eliminan en `stop()`.

## Endpoints HTTP

Prefijo de negocio `/api` (`API_PREFIX`). Listados: `{ data, count }`, más recientes primero; `limit` 1–500 (por defecto 50).

### onboard-api (4001)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado, enlace y resumen de la cola |
| GET | `/api/crew`, `/api/crew/:id` | Tripulación (ficticia, simulada) |
| GET | `/api/vitals?crewMemberId&limit` | Constantes simuladas |
| GET | `/api/check-ins?crewMemberId&limit` | Autoevaluaciones |
| POST | `/api/check-ins` | Registrar autoevaluación (validación estricta; `id`, `recordedAt` y `source` los pone el servidor) |
| GET | `/api/alerts?status&severity&limit` | Alertas generadas a bordo |
| GET | `/api/sync/events?status&limit` | Cola de sincronización (orden de `sequence`) |
| GET | `/api/sync/status` | Estado del enlace, contadores de la cola, despachador |

**Controles de simulación** — solo si `NODE_ENV !== 'production'`:

| Método | Ruta | Cuerpo |
|---|---|---|
| GET | `/api/dev/link` | — |
| PUT | `/api/dev/link` | `{ state?, latencyMs?, degradedLatencyMs?, degradedFailureRate? }` |
| POST | `/api/dev/link/failures` | `{ count }` (1–100) |
| POST | `/api/dev/telemetry/tick` | — (genera una lectura por tripulante) |
| POST | `/api/dev/sync/flush` | — (envía ahora lo pendiente) |

### ground-api (4000)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | Estado y eventos procesados |
| POST | `/api/sync/events` | Recibe un `SyncEvent`. Responde `SyncAck`: **201** `accepted`, **200** `duplicate`, **422** `rejected`. **400** si el evento no es identificable o no va dirigido a tierra |
| GET | `/api/sync/events?limit` | Eventos aplicados |
| GET | `/api/sync/stats` | Contadores, última secuencia por origen, rechazos recientes |
| GET | `/api/crew`, `/api/crew/:id` | Tripulación recibida |
| GET | `/api/vitals`, `/api/check-ins`, `/api/camera-metrics` | `?crewMemberId&limit` |
| GET | `/api/alerts?status&severity&limit` | Alertas recibidas |

## Eventos Socket.IO (ground-api → dashboard)

Emitidos a todos los clientes conectados cuando tierra **acepta y aplica** un registro (no en duplicados, rechazos ni versiones antiguas). El payload es la entidad validada.

| Entidad recibida | Evento (`SOCKET_EVENTS`) |
|---|---|
| `crew_member` | `crew:updated` |
| `vital_signs` | `vitals:recorded` |
| `wellness_check_in` | `check-in:submitted` |
| `camera_metrics` | `camera:metrics-recorded` |
| `alert` (create / update) | `alert:created` / `alert:updated` |

`sync:event`, `sync:ack`, `sync:status` y `link:status` siguen reservados: la sincronización no usa Socket.IO. El dashboard se conecta a través del proxy de Vite (`/socket.io`, con WebSocket) o directamente si su origen está en `SOCKET_CORS_ORIGINS`.

## Demostración (procesos reales, 14/11/2026)

Ground en 4100 y onboard en 4101 (`TELEMETRY_INTERVAL_MS=0`, `SYNC_INTERVAL_MS=0`, `SYNC_BACKOFF_BASE_MS=500`), controlados por HTTP, con un cliente Socket.IO conectado.

| Escenario | Resultado |
|---|---|
| **A · Normal** | 6 eventos (3 tripulantes + 3 lecturas) → `accepted` 6/6; cola `acknowledged: 6`; tierra con 3 tripulantes |
| **B · Pérdida** | Con el enlace caído, `flush` → `skipped`; quedan pendientes `#6 alert`, `#7–9 vital_signs`, `#10 wellness_check_in`; tierra sin cambios; alerta activa a bordo |
| **D · Duplicación** | Mismo UUID dos veces: 201 `accepted` y después 200 `duplicate`; lecturas en tierra 3 → 4 (una sola vez) |
| **C · Reconexión** | Reenvío automático: cola `pending: 0, acknowledged: 12`; el evento de D se reenvía con el mismo UUID y `sequence` 7 y tierra responde `duplicate`; alerta de enlace `resolved` en tierra; `duplicate: 2` (D manual + reenvío) |
| **Reintentos** | 2 fallos transitorios: evento #12 → `retry_scheduled` (intentos 1 y 2, `TRANSIENT_FAILURE`) → entregado en el 3.º con el mismo UUID |
| **E · Tiempo real** | El cliente recibió `crew:updated` ×3, `vitals:recorded` ×9, `check-in:submitted` ×1, `alert:created` ×1, `alert:updated` ×1. `vitals:recorded` = lecturas aceptadas (9 = 9), todas `simulated: true` |

Los escenarios también están automatizados en `services/onboard-api/test/integration.test.js` (servidor de tierra real en un puerto efímero).

## Limitaciones conocidas

- **Persistencia**: todo en memoria. Si **tierra se reinicia**, pierde lo recibido y la nave no reenvía lo ya confirmado. En particular, la tripulación solo se envía al arrancar la nave: tras reiniciar tierra, `GET /api/crew` queda vacío hasta reiniciar la nave. Si **la nave se reinicia**, `sequence` vuelve a 0 (tierra no lo rechaza: la idempotencia es por UUID).
- **Sin autenticación** entre APIs ni en Socket.IO (fuera del alcance de esta fase).
- **Crecimiento**: la cola y los registros crecen sin límite durante la ejecución (sin purga de eventos confirmados).
- **Alertas**: solo operativas de comunicaciones. No hay alertas clínicas ni umbrales.
- **Cámara**: tierra acepta y emite `camera_metrics`, pero la nave aún no los genera (MediaPipe, fase posterior).

## Consumo desde las interfaces

- **Ground Control** usa los endpoints de consulta de Ground API y **una sola** conexión Socket.IO; al reconectar recarga por HTTP lo emitido sin conexión y fusiona por UUID. Detecta reinicios de Ground API cuando `processedEvents` retrocede.
- **Onboard** usa Onboard API con un único sondeo cada ~3 s (`GET /api/sync/status` y `GET /api/sync/events?status=…` de los estados sin acuse).
- **Confirmación de recepción en Onboard:** solo se muestra «Recibido por Tierra» con evidencia (instantánea de `/api/sync/status` sin eventos sin acuse, posterior a la creación del registro). `GET /api/sync/events` devuelve los eventos **más antiguos** (orden ascendente, máximo 500, sin paginación ni filtro por entidad), así que no sirve para confirmar un evento reciente concreto. **Pendiente para la integración:** añadir un filtro por `entityId` u orden descendente con paginación. Detalles en [frontend.md](frontend.md).
