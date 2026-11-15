# Alertas y dimensiones de fatiga y estrés

## Principios

- **Sin diagnósticos.** Ni las dimensiones ni las alertas clasifican a nadie como sano o enfermo.
- **Reglas demostrativas.** Toda regla automática lleva `rule.demonstrative: true`. Sus umbrales son parámetros de **demostración**, configurables y sin validación clínica. Los mensajes lo dicen explícitamente.
- **Línea base personal** antes que valores absolutos, donde hay datos: el tiempo de reacción se compara con las pruebas anteriores **del mismo tripulante y protocolo**.
- **Calidad de datos ≠ bienestar.** La falta de datos genera alertas `data_quality` de severidad `info`, separadas de las de bienestar o rendimiento.
- **Procedencia siempre visible.** Cada alerta incluye su `evidence`: los registros que la sustentan, con tipo, id, momento, fuente (`self_report`, `sensor`, `camera`, `cognitive_test`) y si son simulados.

## Dimensiones (Ground Control → detalle del tripulante)

Son indicadores **separados**. No se combinan en una puntuación: no existe una fórmula validada para estos datos, y una cifra compuesta aparentaría una precisión que no tiene. Cada tarjeta muestra el último valor, la fecha (UTC y antigüedad), la procedencia, la evolución (minigráfico y texto: número de registros, primer y último valor, rango) y, si falta el dato, **cómo obtenerlo**.

| Fatiga | Fuente | Tipo |
|---|---|---|
| Horas de sueño | Autoevaluación (`sleepDuration`) | Autodeclarado |
| Somnolencia (KSS 1–9) | Autoevaluación (`sleepiness`) | Autodeclarado |
| Fatiga (1–5) | Autoevaluación (`fatigue`) | Autodeclarado |
| PVT · TR medio y lapsos | `VigilanceTest` | Medido (prueba cognitiva) |
| Ojos cerrados y parpadeo | `CameraMetrics` | **Experimental** (modelo de visión) |

| Respuesta al estrés | Fuente | Tipo |
|---|---|---|
| Frecuencia cardiaca | `VitalSigns.heartRate` | Sensor (**simulado** en la demo) |
| HRV (RMSSD, ms) | `VitalSigns.heartRateVariability` | Sensor (**simulado**). No se deriva de la FC |
| Estrés percibido (1–5) | Autoevaluación (`stress`) | Autodeclarado |
| Actividad reciente (MET) | `VitalSigns.activityLevel` | Sensor (**simulado**) |

**HRV.** Representa el RMSSD que calcularía el dispositivo a partir de los intervalos entre latidos. La frecuencia cardiaca media **no** permite calcularla, y el sistema nunca lo intenta. En esta demo es un paseo aleatorio del simulador, marcado como «Simulado» y sin valor clínico.

**KSS.** Karolinska Sleepiness Scale (Åkerstedt y Gillberg, 1990): somnolencia **en este momento**, de 1 («extremadamente despierto») a 9 («luchando contra el sueño»). Es opcional en la autoevaluación y distinta de la fatiga (1–5).

## Reglas (Onboard API, `services/onboard-api/src/alerts/demo-rules.js`)

| Regla (`rule.id`) | Categoría | Se evalúa con | Condición (valores por defecto) |
|---|---|---|---|
| `demo.pvt.lapses` | `cognitive` | Cada PVT | lapsos ≥ `minLapses` (5) |
| `demo.pvt.errors` | `cognitive` | Cada PVT | falsas salidas + omisiones ≥ `minErrors` (3) |
| `demo.pvt.baseline` | `cognitive` | Cada PVT | TR medio ≥ +`minIncreasePercent` (20 %) sobre la media de las `baselineTests` (3) PVT anteriores del mismo protocolo. Sin esas 3 pruebas **no se evalúa** |
| `demo.sleepiness.self_report` | `wellness` | Cada autoevaluación con KSS | KSS ≥ `minKss` (7). Sin KSS no cambia el estado |
| `data.vitals.stale` | `data_quality` | Periódica (cada 60 s) | sin signos vitales en `vitalsMaxAgeMinutes` (10) |
| `data.check_in.stale` | `data_quality` | Periódica | sin autoevaluación en `checkInMaxAgeHours` (24) |

Sin ningún registro previo, la antigüedad se cuenta desde el arranque de Onboard API. Las alertas de enlace (`communication`) siguen funcionando como antes.

**Configuración:**
- `ALERT_RULES_JSON`: cambios parciales, p. ej. `{"pvtLapses":{"minLapses":3},"sleepinessHigh":{"enabled":false}}`.
- `ALERT_STALE_CHECK_MS`: intervalo de la comprobación periódica; 0 la desactiva.
- `GET /api/dev/alerts/rules`: muestra la configuración efectiva (solo en desarrollo).
- `POST /api/dev/alerts/check-staleness`: ejecuta la comprobación al momento.

## Deduplicación y sincronización

1. **Una alerta abierta por `dedupKey`** (`<regla>:<tripulante>`). Si la condición se repite, se **actualiza** esa alerta con la nueva evidencia (como máximo 20, primero la más reciente) en lugar de crear otra. Si el último registro ya no la cumple, se **resuelve**.
2. **Cada registro se evalúa una sola vez** por regla.
3. La comprobación periódica no reescribe una alerta si no hay evidencia nueva, así que no genera tráfico en cada ciclo.
4. Hacia Tierra viajan como `SyncEvent` `create` o `update`, con el id de la alerta. Un reenvío tras perder el acuse se responde como `duplicate` y no se reaplica, y la última escritura gana por `updatedAt`. Ground Control las recibe por Socket.IO (`alert:created` y `alert:updated`).

Las pruebas lo cubren en `services/onboard-api/test/alert-rules.test.js` y `services/ground-api/test/api.test.js`, y el E2E (`npm run e2e:demo`, pasos B2) lo comprueba con desconexión, fallos inyectados y reconexión.
