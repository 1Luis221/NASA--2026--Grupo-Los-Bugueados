# Modelos y contratos compartidos

Todos los modelos viven en [`packages/shared`](../packages/shared/src/schemas) como esquemas **Zod 4** en JavaScript ESM. Son la única fuente de verdad del formato de datos entre frontends y APIs, y funcionan tanto en navegador como en Node.

```js
import { VitalSignsSchema, SOCKET_EVENTS } from '@astronaut-wellness/shared'
import { exampleVitalSigns } from '@astronaut-wellness/shared/examples'

const result = VitalSignsSchema.safeParse(payload) // { success, data | error }
```

| Subpath | Contenido |
|---|---|
| `@astronaut-wellness/shared` | Todo lo siguiente |
| `…/schemas` | Esquemas, enumeraciones y transiciones de estado |
| `…/events` | `SOCKET_EVENTS` |
| `…/constants` | `PORTS`, `SERVICE_NAMES`, `API_PREFIX` |
| `…/examples` | Un ejemplo válido por entidad (verificado por los tests) |

## Convenciones comunes

| Concepto | Regla |
|---|---|
| Identificadores | UUID (`crypto.randomUUID()`), campo `id`; referencias como `crewMemberId` |
| Fechas | ISO 8601 **en UTC con `Z`** (`2026-11-14T10:00:00.000Z`). Se rechazan desplazamientos horarios para evitar ambigüedad entre relojes de nave y tierra |
| Mediciones | Siempre `{ value, unit }` con unidad literal obligatoria |
| Procedencia | `source: { type, simulated, deviceId? }` |
| Campos desconocidos | Depende del modo de validación (ver siguiente sección) |

### Modos de validación: tolerante y estricto

Cada entidad se define **una sola vez** y se exporta en dos variantes (helper `defineSchemas`):

| Variante | Construida con | Campos desconocidos | Usar para |
|---|---|---|---|
| `XSchema` (p. ej. `VitalSignsSchema`) | `z.object` | Se **descartan** del resultado, sin error | Datos **entrantes**: lo que llega del otro nodo o de un cliente |
| `XStrictSchema` (p. ej. `VitalSignsStrictSchema`) | `z.strictObject` | Se **rechazan** con `unrecognized_keys` | Registros que **nuestro sistema crea o envía** |

- **Tolerante**: si tierra recibe datos de una nave con una versión más nueva del modelo (un campo extra), los procesa en lugar de perderlos. Los campos desconocidos no se almacenan: solo pasa lo validado.
- **Estricto**: un error de escritura (`crewMemberID`, `source.devicId`) en un registro que creamos nosotros se detecta en origen en lugar de desaparecer en silencio.
- La rigurosidad se aplica en **todos los niveles** (objetos anidados, mediciones y el `payload` de `SyncEvent`), no solo en el nivel superior como haría `.strict()`.
- Las reglas de dominio y coherencia son idénticas en ambos modos; solo cambia el trato de los campos desconocidos.

```js
// Al recibir:  datos de red → modo tolerante
const incoming = VitalSignsSchema.parse(req.body)

// Al crear/enviar: registros propios → modo estricto
const reading = VitalSignsStrictSchema.parse({ id: crypto.randomUUID(), ... })
```

### Procedencia de los datos

`source.type` indica **cómo** se capturó el dato y `source.simulated` indica **si es simulado**. Cada entidad fija su modalidad:

| Entidad | `source.type` |
|---|---|
| `VitalSigns` | `sensor` |
| `CameraMetrics` | `camera` |
| `WellnessCheckIn` | `self_report` |

Así, un pulso generado por el simulador es `{ type: 'sensor', simulated: true }`: sigue siendo un dato "de sensor" para la UI, pero se puede filtrar o señalar como simulado.

### Rangos de validación ≠ umbrales clínicos

Los `min`/`max` de las mediciones son **límites de dominio o de plausibilidad física**: rechazan lecturas imposibles (sensor desconectado, Fahrenheit enviado como Celsius, porcentaje > 100). Son deliberadamente amplios y **no** indican normalidad ni deben usarse para generar alertas. Los criterios de alerta se definirán aparte y, preferentemente, en relación con la línea base de cada tripulante.

## Entidades

### CrewMember

Datos operativos del tripulante. No contiene información médica.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID | |
| `name` | texto 1–100 | |
| `callsign` | texto 1–30 | opcional |
| `role` | `commander` · `pilot` · `flight_engineer` · `mission_specialist` · `payload_specialist` · `medical_officer` | |
| `agency` | texto 1–50 | opcional |
| `status` | `active` · `inactive` | |
| `createdAt`, `updatedAt` | fecha | `updatedAt ≥ createdAt` |

```json
{
  "id": "12326863-919b-42a3-959e-837237f6fc6f",
  "name": "Ana Torres",
  "callsign": "Nova",
  "role": "commander",
  "agency": "ESA",
  "status": "active",
  "createdAt": "2026-11-01T08:00:00.000Z",
  "updatedAt": "2026-11-01T08:00:00.000Z"
}
```

### VitalSigns

Lectura de constantes en un instante (`recordedAt`). Todas las mediciones son opcionales, pero se exige **al menos una**.

| Campo | Unidad | Dominio aceptado |
|---|---|---|
| `heartRate` | `bpm` | 20–300 |
| `respiratoryRate` | `breaths/min` | 0–100 |
| `oxygenSaturation` | `%` | 0–100 |
| `bodyTemperature` | `degC` | 20–45 |
| `bloodPressure` | `mmHg` | sistólica 40–300, diastólica 10–200, sistólica > diastólica |
| `heartRateVariability` | `ms` | 0–1000 |

```json
{
  "id": "5ac17ecf-bf3e-440a-b91a-6ac7ac16ca89",
  "crewMemberId": "12326863-919b-42a3-959e-837237f6fc6f",
  "recordedAt": "2026-11-14T10:00:00.000Z",
  "source": { "type": "sensor", "simulated": true, "deviceId": "sim-wearable-01" },
  "heartRate": { "value": 72, "unit": "bpm" },
  "respiratoryRate": { "value": 14, "unit": "breaths/min" },
  "oxygenSaturation": { "value": 98, "unit": "%" },
  "bodyTemperature": { "value": 36.7, "unit": "degC" },
  "bloodPressure": { "systolic": 118, "diastolic": 76, "unit": "mmHg" },
  "heartRateVariability": { "value": 45, "unit": "ms" }
}
```

### WellnessCheckIn

Autoevaluación subjetiva. Escalas Likert enteras **1–5**:

| Campo | 1 | 5 |
|---|---|---|
| `mood` | muy malo | muy bueno |
| `sleepQuality` | muy mala | muy buena |
| `stress` | muy bajo | muy alto |
| `fatigue` | muy baja | muy alta |

Opcionales: `sleepDuration` (`h`, 0–24) y `notes` (texto ≤ 500).

```json
{
  "id": "0a4475e4-5e74-4d23-a0ad-0f62835ea787",
  "crewMemberId": "12326863-919b-42a3-959e-837237f6fc6f",
  "recordedAt": "2026-11-14T07:30:00.000Z",
  "source": { "type": "self_report", "simulated": true },
  "mood": 4, "stress": 2, "fatigue": 3, "sleepQuality": 3,
  "sleepDuration": { "value": 6.5, "unit": "h" },
  "notes": "Ligera congestión nasal al despertar."
}
```

### CameraMetrics

Indicadores **agregados** de una ventana de análisis que termina en `recordedAt`. Por privacidad nunca incluye imágenes ni landmarks en bruto.

| Campo | Unidad | Dominio |
|---|---|---|
| `windowDuration` | `s` | 1–3600 (obligatorio) |
| `faceDetected` | booleano | obligatorio |
| `confidence` | — | 0–1, opcional |
| `model` | `{ name, version }` | opcional |
| `blinkRate` | `blinks/min` | 0–120 |
| `eyeClosureRatio` | `ratio` | 0–1 (fracción de la ventana con ojos cerrados, tipo PERCLOS) |
| `yawnCount` | `count` | entero 0–1000 |
| `headPose.pitch/yaw/roll` | `deg` | −180–180 |

Coherencia: con `faceDetected: true` se exige al menos una métrica; con `false` no puede haber métricas faciales.

```json
{
  "id": "cb4fdf57-2caa-41c0-a89c-31eb99ee2884",
  "crewMemberId": "12326863-919b-42a3-959e-837237f6fc6f",
  "recordedAt": "2026-11-14T10:05:00.000Z",
  "source": { "type": "camera", "simulated": true, "deviceId": "sim-cabin-cam-01" },
  "windowDuration": { "value": 60, "unit": "s" },
  "faceDetected": true,
  "confidence": 0.92,
  "model": { "name": "simulator", "version": "0.1.0" },
  "blinkRate": { "value": 17, "unit": "blinks/min" },
  "eyeClosureRatio": { "value": 0.08, "unit": "ratio" },
  "yawnCount": { "value": 1, "unit": "count" },
  "headPose": {
    "pitch": { "value": -5, "unit": "deg" },
    "yaw": { "value": 3, "unit": "deg" },
    "roll": { "value": 0, "unit": "deg" }
  }
}
```

### Alert

Aviso operativo. La severidad indica **prioridad de atención**, no un diagnóstico.

| Campo | Valores |
|---|---|
| `severity` | `info` · `warning` · `critical` |
| `status` | `active` · `acknowledged` · `resolved` |
| `category` | `vital_signs` · `wellness` · `camera` · `communication` · `system` |
| `origin` | `onboard` · `ground` (nodo que la generó) |
| `crewMemberId` | opcional (alertas de sistema/comunicaciones) |
| `relatedRecord` | `{ entityType, id }` opcional: registro que la motivó |

Ciclo de vida (`canTransitionAlertStatus`):

```
active ──► acknowledged ──► resolved
   └──────────────────────────▲
```

Reglas: `acknowledged` exige `acknowledgedAt`; `resolved` exige `resolvedAt`; una alerta `active` no puede tener marcas de reconocimiento ni resolución; las fechas deben ser cronológicas (`createdAt ≤ acknowledgedAt ≤ resolvedAt`).

```json
{
  "id": "ccb569e3-4aec-4697-82de-683c741087c9",
  "crewMemberId": "12326863-919b-42a3-959e-837237f6fc6f",
  "origin": "onboard",
  "category": "wellness",
  "severity": "warning",
  "status": "acknowledged",
  "title": "Fatiga autoinformada elevada",
  "message": "La tripulante reporta fatiga 3/5 con 6,5 h de sueño.",
  "relatedRecord": { "entityType": "wellness_check_in", "id": "0a4475e4-5e74-4d23-a0ad-0f62835ea787" },
  "createdAt": "2026-11-14T07:31:00.000Z",
  "updatedAt": "2026-11-14T07:45:00.000Z",
  "acknowledgedAt": "2026-11-14T07:45:00.000Z",
  "acknowledgedBy": "Flight Surgeon"
}
```

### SyncEvent

Unidad de la cola **store-and-forward** entre nave y tierra. Envuelve una entidad (`payload`) y registra su entrega, incluidas las interrupciones del enlace.

| Campo | Notas |
|---|---|
| `sequence` | entero ≥ 0, monótono por nodo de origen: ordenar y descartar duplicados |
| `origin` / `destination` | `onboard` · `ground`, distintos |
| `entityType` | `crew_member` · `vital_signs` · `wellness_check_in` · `camera_metrics` · `alert` |
| `entityId` | debe coincidir con `payload.id` |
| `operation` | `create` · `update` (el payload es la entidad completa) |
| `payload` | se valida contra el esquema de `entityType`, en el mismo modo (tolerante/estricto) que el evento; el resultado contiene el payload ya parseado |
| `attempts` / `maxAttempts` | `attempts ≤ maxAttempts`, máximo 1–100 |
| `lastAttemptAt`, `nextRetryAt`, `lastError { code, message }` | control de reintentos |
| `createdAt`, `updatedAt`, `acknowledgedAt` | |

Estados (`canTransitionSyncStatus`):

| Desde | Puede pasar a |
|---|---|
| `pending` | `sending` |
| `sending` | `acknowledged` · `retry_scheduled` · `failed` |
| `retry_scheduled` | `sending` · `failed` |
| `failed` | `pending` (solo reencolado manual) |
| `acknowledged` | — (final) |

| Estado | Significado | Requisitos |
|---|---|---|
| `pending` | En cola, esperando enlace | — |
| `sending` | Intento en curso | `attempts ≥ 1`, `lastAttemptAt` |
| `retry_scheduled` | Falló un intento (p. ej. pérdida de señal); se reintentará | `lastError`, `nextRetryAt ≥ lastAttemptAt`, `1 ≤ attempts < maxAttempts` |
| `acknowledged` | El destino confirmó la recepción (final) | `acknowledgedAt` |
| `failed` | Reintentos agotados o error no recuperable | `lastError` |

Ejemplo — lectura en espera tras una pérdida de señal (*LOS*):

```json
{
  "id": "73d6589e-c6df-43ee-a92a-ca9e3d5fecd5",
  "sequence": 42,
  "origin": "onboard",
  "destination": "ground",
  "entityType": "vital_signs",
  "entityId": "5ac17ecf-bf3e-440a-b91a-6ac7ac16ca89",
  "operation": "create",
  "payload": { "…": "VitalSigns completo (ver arriba)" },
  "status": "retry_scheduled",
  "attempts": 2,
  "maxAttempts": 10,
  "lastAttemptAt": "2026-11-14T10:00:30.000Z",
  "nextRetryAt": "2026-11-14T10:01:30.000Z",
  "lastError": { "code": "LINK_DOWN", "message": "Enlace nave-tierra no disponible (LOS)." },
  "createdAt": "2026-11-14T10:00:01.000Z",
  "updatedAt": "2026-11-14T10:00:30.000Z"
}
```

#### Idempotencia

- **`id` es la clave de idempotencia.** Se genera una sola vez al encolar el evento (`crypto.randomUUID()`) y **no cambia entre reintentos**: un reintento reenvía el mismo `id`.
- El receptor registra los `id` ya procesados. Si recibe uno repetido (p. ej. porque el acuse anterior se perdió en un corte de enlace), no lo reaplica y responde `duplicate`.
- `(origin, sequence)` también identifica el evento de forma única. `sequence` es monótono por nodo de origen: permite ordenar y detectar huecos.
- El esquema garantiza la presencia y el formato de estas claves; la unicidad entre eventos se comprobará en el receptor (Fase 2).

### SyncAck

Acuse de recibo que el receptor devuelve al emisor de un `SyncEvent`.

| Campo | Notas |
|---|---|
| `eventId` | `SyncEvent.id` confirmado |
| `sequence` | `SyncEvent.sequence` confirmado |
| `origin` / `destination` | nodo que envía el acuse / emisor original; distintos |
| `result` | `accepted` (procesado) · `duplicate` (ya procesado, no se reaplica) · `rejected` (inválido) |
| `receivedAt` | fecha |
| `error` | `{ code, message }`, obligatorio solo si `result = rejected` |

```json
{
  "eventId": "73d6589e-c6df-43ee-a92a-ca9e3d5fecd5",
  "sequence": 42,
  "origin": "ground",
  "destination": "onboard",
  "result": "accepted",
  "receivedAt": "2026-11-14T10:01:31.000Z"
}
```

El transporte, la política de reintentos (backoff) y el registro de ids procesados **no** forman parte de este paquete: se implementarán en las APIs.

`LINK_STATES` (`connected` · `degraded` · `disconnected`) describe el estado del enlace en sí, independiente de cada evento.

## Eventos Socket.IO

Convención `dominio:acción`. Solo están definidos los nombres; los emisores y receptores llegarán en la Fase 2.

| Constante | Evento | Payload previsto |
|---|---|---|
| `VITALS_RECORDED` | `vitals:recorded` | `VitalSigns` |
| `CAMERA_METRICS_RECORDED` | `camera:metrics-recorded` | `CameraMetrics` |
| `CHECK_IN_SUBMITTED` | `check-in:submitted` | `WellnessCheckIn` |
| `CREW_UPDATED` | `crew:updated` | `CrewMember` |
| `ALERT_CREATED` / `ALERT_UPDATED` | `alert:created` / `alert:updated` | `Alert` |
| `SYNC_EVENT` | `sync:event` | `SyncEvent` |
| `SYNC_ACK` | `sync:ack` | `SyncAck` |
| `SYNC_STATUS` | `sync:status` | por definir (Fase 2) |
| `LINK_STATUS` | `link:status` | por definir (Fase 2) |

## Pruebas

```bash
npm test                          # todos los workspaces
npm test -w @astronaut-wellness/shared
```

Los tests (`packages/shared/test/`) verifican que cada ejemplo de esta página es válido y que se rechazan los errores de formato, dominio y coherencia descritos.
