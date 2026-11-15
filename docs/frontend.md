# Interfaces (frontend)

Dos aplicaciones React (JavaScript + JSX) y una biblioteca compartida. Cada aplicación habla **solo con su API** a través del proxy de Vite.

```
apps/onboard (5174) ──/api──────────────► Onboard API (4001)
apps/ground-control (5173) ──/api────────► Ground API (4000)
                           ──/socket.io──► Ground API (Socket.IO, una sola conexión)
packages/ui ── tema, componentes, capa de datos (lo usan las dos apps)
packages/shared ── contratos Zod y nombres de eventos (lo usan apps y APIs)
```

## `packages/ui`

Biblioteca compartida: **solo** contiene lo que usan las dos aplicaciones.

| Carpeta | Contenido |
|---|---|
| `src/styles/globals.css` | Tema oscuro (Tailwind v4 + tokens shadcn), foco visible, `prefers-reduced-motion`, `@source` para escanear el paquete |
| `src/components/ui/` | Componentes base de shadcn/ui en JSX: Button, Card, Badge, Input, Label, Select, Textarea, Table, Skeleton, Alert |
| `src/components/` | AppShell, Sidebar, Header, PageSection, MetricCard, StatusIndicator, Loading/Empty/ErrorState, SourceBadge, VitalSignsChart, VitalSignsSummary, AlertList, CrewCard, WellnessSummary, CheckInTable |
| `src/data/` | `createApiClient` (fetch, `ApiError`, GET compartidas, cancelación), `useResource`, `usePolling`, `useNow` |
| `src/lib/` | Formato de fechas/unidades (ausente ≠ 0), etiquetas de enumeraciones, tripulantes desconocidos, resúmenes descriptivos |
| `scripts/contrast.mjs` | Medición reproducible del contraste (WCAG 2.2) |
| `test/` | Pruebas y `setup.js` compartido (`@astronaut-wellness/ui/test-setup`) |

Los componentes propios de cada aplicación (tiempo real de tierra, selector de tripulante, formulario de autoevaluación…) viven en su `apps/*/src`.

## Ground Control (5173)

Datos exclusivamente de Ground API. Una única conexión Socket.IO (`RealtimeProvider`) actualiza las vistas sin recargar.

| Pantalla | Contenido |
|---|---|
| Panel principal | Tripulantes conocidos y desconocidos, alertas activas, eventos recibidos, hora y antigüedad del último dato, última lectura por tripulante, medias descriptivas de bienestar, últimas autoevaluaciones |
| Tripulación | Tarjetas con nombre, identificador, rol, estado, última medición y alertas; los identificadores sin perfil se muestran como «Tripulante desconocido» |
| Detalle (`/crew/:id`) | Perfil, última medición, **Fatiga** y **Respuesta al estrés** (indicadores separados con último valor, fecha, procedencia, evolución y cómo obtener los que faltan; sin puntuación combinada, ver [alerts.md](alerts.md)), historial con gráfico + resumen textual + tabla, autoevaluaciones, alertas (con regla demostrativa y evidencia), vigilancia cognitiva (PVT: TR medio/mediano, lapsos, falsas salidas, omisiones, protocolo y procedencia) y métricas de cámara (con modelo y procedencia), todo en tiempo real |
| Alertas | Tabla filtrable por estado y severidad (solo lectura: la API no permite modificarlas) |
| Sincronización | A · datos recibidos (`/api/sync/stats`), B · conexión Socket.IO del navegador, C · «Estado del enlace no verificable desde Tierra» |

**Vigencia de los datos.** Los registros de HTTP y Socket.IO se fusionan por UUID (gana la versión más reciente). Si el navegador pierde la conexión en tiempo real se avisa de que los datos pueden estar desactualizados. Como Ground API guarda todo en memoria, se detecta su reinicio cuando `processedEvents` retrocede: se descartan los datos antiguos del navegador y se explica. Una conexión Socket.IO activa **no** indica que el enlace espacial funcione.

## Onboard (5174)

Datos exclusivamente de Onboard API; la nave no tiene Socket.IO, así que el estado se consulta con **un único sondeo cada ~3 s** (en pausa con la pestaña oculta, sin peticiones solapadas).

| Pantalla | Contenido |
|---|---|
| Inicio | Tripulante seleccionado, últimos signos vitales, bienestar, última autoevaluación, alertas, enlace simulado y eventos pendientes |
| Signos vitales | Lecturas con unidad, fecha y fuente, etiqueta «Simulado», historial con gráfico y tabla |
| Autoevaluación | Formulario validado con el contrato (mismo esquema que la API), con somnolencia KSS 1–9 opcional, errores por campo, confirmación solo con HTTP 201 e historial con su estado de sincronización |
| Sincronización | Enlace simulado, latencia, contadores de la cola, eventos sin acuse con intentos, próximo reintento y último error |
| Cámara | Análisis facial **local y experimental** con MediaPipe Face Landmarker. La cámara solo se pide al pulsar «Activar cámara»; el vídeo, los fotogramas y los landmarks nunca salen del navegador (los puntos se dibujan sobre la vista previa local). Métricas en vivo y, por ventanas de 15/30/60 s, métricas agregadas que **solo se envían si se marca «Enviar métricas agregadas»** (desmarcado por defecto). «Detener cámara», salir de la pantalla o un error liberan pistas, bucle de fotogramas y modelo. MediaPipe (~150 kB JS + WASM y modelo) se descarga solo al activar la cámara. La pantalla indica siempre de dónde se carga el modelo (local: «funciona sin conexión»; remoto: «requiere red»). Usa el delegado **GPU** y, si no está disponible, **CPU**, avisándolo en pantalla con el motivo. MediaPipe necesita **WebGL** en ambos casos: sin él se muestra un error explicativo antes de crear el detector, y si el contexto WebGL se pierde durante el análisis la sesión se detiene con un mensaje claro y puede reactivarse |
| Vigilancia | Prueba de vigilancia psicomotora: PVT-B (3 min) o demostración de 1 min (marcada como no estándar). Respuesta con la barra espaciadora (sin autorrepetición) o pulsando la zona de respuesta; falsas salidas, lapsos y omisiones según el protocolo. El resultado se muestra y **solo se envía con «Enviar resultado»** (confirmación con HTTP 201 y estado de sincronización con Tierra); historial con su procedencia. **Procedencia:** solo cuentan como respuestas de una persona los eventos de confianza del navegador (`isTrusted`). Las generadas por un script (p. ej. el E2E) solo se admiten en desarrollo, se avisan en pantalla y el resultado se guarda como **simulado**; fuera de desarrollo se ignoran |
| Simulación | **Solo en desarrollo**: estado del enlace, latencia, fallos transitorios, telemetría y envío forzado. En el build de producción no existe ni la pantalla ni el código de `/api/dev` |

El tripulante seleccionado se recuerda en el navegador (`localStorage`); **no es autenticación**.

### «Guardada a bordo» ≠ «Recibida por Tierra»

Un 201 de Onboard API solo significa que la nave guardó el registro. El estado de sincronización se muestra **solo con evidencia**:

| Estado mostrado | Evidencia |
|---|---|
| Pendiente / Enviando / Reintento programado / Fallido | El evento aparece en `GET /api/sync/events?status=…` |
| Recibido por Tierra | Una instantánea de `GET /api/sync/status`, pedida **después** de saber que el registro existe, tiene **0** eventos sin acuse (los estados son excluyentes, así que el evento está `acknowledged`) |
| Sin confirmación verificable | Ninguna de las anteriores (p. ej. la cola tiene otros eventos pendientes o la consulta pudo truncarse) |
| Comprobando… | Aún no hay datos posteriores a la creación |

Nunca se deduce la recepción por la **ausencia** de un evento en una consulta: `GET /api/sync/events` ordena de forma ascendente, se corta en 500 elementos y no tiene paginación. Solo se comparan horas del navegador, no del servidor.

**Bloqueo para la integración:** para confirmar cada evento individualmente con la cola ocupada haría falta un filtro por `entityId` o un orden descendente con paginación en `GET /api/sync/events`. Sin cambiar el contrato, la confirmación llega cuando la cola queda sin eventos pendientes (en uso normal, en segundos).

## Accesibilidad

- Navegación con teclado, enlace «Saltar al contenido», foco siempre visible, `scroll-padding` para que el encabezado fijo no tape el foco.
- Menú móvil: Escape lo cierra y devuelve el foco; con el panel abierto el resto de la página es `inert`.
- Estados siempre con texto (no solo color); cambios de conexión anunciados con `role="status"` (una sola región por estado).
- Formularios con etiquetas, errores asociados (`aria-describedby`), escalas como `radiogroup` obligatorio y navegables con flechas.
- Gráficos con resumen textual y tabla equivalente; tablas con `caption` y encabezados.
- `prefers-reduced-motion`: sin animaciones; gráficos sin animación siempre.
- **Contraste medido** con `npm run a11y:contrast` (33 combinaciones reales; texto ≥ 4.5:1, controles/foco/indicadores ≥ 3:1). Una prueba lo comprueba en `npm test`.

## Rendimiento

- Pantallas cargadas bajo demanda (`React.lazy`); Recharts solo en el detalle (tierra) y en signos vitales (nave).
- Ground Control incluye los esquemas Zod en la carga inicial para validar cada evento Socket.IO entrante.
- GET idénticas en curso se comparten; `useResource` mantiene una sola petición por recurso y descarta respuestas antiguas.
- Temporizadores, sondeos y suscripciones se limpian al desmontar (cubierto por pruebas).

| Fragmento (build de producción) | Tamaño | gzip |
|---|---|---|
| Ground Control · principal | 309 kB | 99 kB |
| Ground Control · detalle de tripulante (Recharts) | 387 kB | 112 kB |
| Onboard · principal | 373 kB | 121 kB |
| Onboard · signos vitales (Recharts) | 383 kB | 110 kB |

## Pruebas

`npm test` ejecuta Vitest en todos los workspaces (componentes con React Testing Library y jsdom, sin servicios externos: API y Socket.IO simulados) y las pruebas del script E2E. `npm run e2e:demo` cubre el flujo completo con procesos y navegador reales.
