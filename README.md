# Astronaut Wellness System

Sistema de monitoreo del bienestar de astronautas durante misiones espaciales, desarrollado para el **NASA Space Apps Challenge 2026**.

Dos entornos que se comunican a través de un **enlace nave–Tierra simulado**:

- **A bordo:** interfaz de la tripulación (**Onboard**) y una API local en la nave (**Onboard API**).
- **Tierra:** panel del centro de control (**Ground Control**) y una API terrestre (**Ground API**).

> **Importante**
> - **Todos los datos y la cola de sincronización se guardan en memoria.** No hay base de datos: al reiniciar una API se pierde lo que tenía y **no existe garantía de recuperación**.
> - **Las constantes vitales son simuladas** por Onboard API y la interfaz las marca siempre como «Simulado». No son mediciones médicas reales, no se clasifican como normales o anormales y el sistema **no realiza diagnósticos**.
> - **Análisis por cámara (experimental):** se ejecuta en el navegador de a bordo con MediaPipe Face Landmarker, solo tras activarlo el tripulante. El vídeo **nunca** se transmite; solo se envían métricas agregadas si se da el consentimiento en pantalla. El runtime WASM de MediaPipe lo sirve la propia app (copiado de `node_modules`). El modelo se sirve localmente si se descargó con `npm run mediapipe:model`; si no, se usa la URL oficial con versión fijada, lo que requiere red. Ambos se pueden sustituir con `VITE_MEDIAPIPE_WASM_URL` y `VITE_FACE_LANDMARKER_MODEL_URL`.
> - **Prueba de vigilancia (PVT):** mide tiempos de reacción reales del tripulante. Los resultados son descriptivos, no diagnósticos.
> - **Fatiga y respuesta al estrés:** indicadores separados, con fuente y fecha (autodeclarados, medidos, simulados o experimentales), **sin puntuación combinada**. Las alertas automáticas son **reglas demostrativas** configurables, no criterios clínicos. Ver [docs/alerts.md](docs/alerts.md).
> - **El enlace nave–Tierra es una simulación** (conectado, degradado, desconectado). No es una conexión espacial real.

## Requisitos

- Node.js **≥ 22.12** y npm ≥ 10.
- Para `npm run e2e:demo`: Microsoft Edge o Google Chrome instalados (o la variable `E2E_BROWSER` con la ruta del ejecutable).

## Puesta en marcha

```bash
npm install      # instala y enlaza todos los workspaces
npm run dev      # las 2 APIs y las 2 interfaces en paralelo
```

| Servicio | Workspace | URL |
|---|---|---|
| Ground Control (UI) | `apps/ground-control` | http://localhost:5173 |
| Onboard (UI) | `apps/onboard` | http://localhost:5174 |
| Ground API | `services/ground-api` | http://localhost:4000/health |
| Onboard API | `services/onboard-api` | http://localhost:4001/health |

### Preparación para usar MediaPipe sin conexión (una vez)

```bash
npm run mediapipe:model   # descarga el modelo (~3,8 MB, requiere red UNA vez) y verifica su SHA-256
# sin red en este equipo: descárgalo en otro y usa  npm run mediapipe:model -- --from ruta/face_landmarker.task
```

- El runtime WASM lo instala `npm install` y lo sirve la propia app: no necesita preparación.
- El modelo se guarda en `apps/onboard/mediapipe-models/`, que no se versiona.
- Después hay que reiniciar Onboard (`npm run dev` o build). A partir de ahí **MediaPipe no hace ninguna petición externa**.
- Si se omite este paso, la pantalla de cámara indica que el modelo se descarga de Google y **requiere red**: la dependencia nunca es silenciosa.
- `npm run e2e:camera` lo verifica con los CDN bloqueados.
- **MediaPipe necesita WebGL**, también al procesar con CPU (lo usa para subir cada fotograma). Si el navegador lo bloquea (p. ej. tras un fallo o reinicio de la GPU con poca memoria), la pantalla lo explica en lugar de fallar con «activeTexture». Compruébalo en `edge://gpu`, y recarga o reinicia el navegador. `VITE_MEDIAPIPE_DELEGATE=CPU` fuerza la CPU para diagnosticar.

Los puertos están definidos en [`packages/shared/src/constants.js`](packages/shared/src/constants.js). Vite usa `strictPort`: si un puerto está ocupado, el arranque falla en lugar de cambiar de puerto en silencio.

## Comandos

| Comando | Descripción |
|---|---|
| `npm run dev` | APIs e interfaces en paralelo (`concurrently`) |
| `npm run dev:apis` | Solo las dos APIs |
| `npm run dev:ground-api` / `dev:onboard-api` | Una API (con `node --watch`) |
| `npm run dev:ground-ui` / `dev:onboard-ui` | Una interfaz |
| `npm run build` | Build de producción de las dos interfaces |
| `npm run lint` / `lint:fix` | ESLint en todo el monorepo |
| `npm test` | Pruebas unitarias y de componentes (Vitest + React Testing Library) de todos los workspaces y del script E2E |
| `npm run e2e:demo` | Flujo crítico de demostración de extremo a extremo en un navegador real (ver abajo) |
| `npm run e2e:camera` | Valida MediaPipe en Edge/Chrome real con la cámara **simulada** de Chromium: activación, landmarks, envío, 10 ciclos de inicio/parada, paradas durante la carga y liberación. Opciones: `-- --face foto.jpg` (vídeo con rostro), `--cpu` (delegado de CPU), `--simulate-no-webgl` (WebGL bloqueado). No prueba una cámara física |
| `npm run mediapipe:model` | Descarga el modelo de MediaPipe (~3,8 MB, no versionado) para que Onboard funcione sin conexión |
| `npm run a11y:contrast` | Mide el contraste WCAG 2.2 de los tokens del tema oscuro |

### Prueba E2E reproducible: `npm run e2e:demo`

Ejecuta el flujo crítico en Edge/Chrome *headless* sobre una **pila propia en puertos aislados** (APIs 4100/4101, interfaces 5273/5274) y la detiene al terminar, sin tocar los procesos de `npm run dev`:

1. selecciona una astronauta en Onboard, 2. desconecta el enlace simulado, 3. registra una autoevaluación, 4. comprueba que queda pendiente, 5. verifica que Tierra aún no la tiene, 6. reconecta, 7. comprueba la sincronización automática, 8. comprueba que Ground Control la muestra sin recargar.

Bloque 2 (pasos «B2»):

9. Realiza una PVT de demostración (60 s) en la interfaz Onboard, con un respondedor **automatizado** dentro de la página, y la envía.
10. Registra fatiga (autoevaluación con KSS y sueño), telemetría **simulada** (FC, HRV, actividad) y métricas de cámara desde un **fixture**, que no prueba el hardware.
11. Comprueba la alerta demostrativa de somnolencia y su llegada a Ground API y a Ground Control (fatiga, estrés, PVT, cámara y alerta).
12. Desconecta el enlace y acumula nuevos registros y alertas, entre ellos la resolución de una alerta.
13. Reconecta con dos fallos transitorios inyectados y verifica que todo llega **exactamente una vez**, sin rechazos ni más de una alerta abierta por regla, y que Ground Control se actualiza sin recargar.

Al final restaura el enlace. Con `E2E_SCREENSHOTS=<carpeta>` guarda capturas.

Devuelve `0` si todo es correcto, `1` si falla un paso (indicando cuál y por qué), `2` si faltan prerrequisitos (p. ej. puertos ocupados) y `130` si se interrumpe. Siempre cierra el navegador y detiene **solo** los procesos que inició.

Opción explícita `npm run e2e:demo -- --attach`: usa la pila ya arrancada en 4000/4001/5173/5174. **Modifica su estado**: crea una autoevaluación de prueba y alterna el enlace simulado (que se restaura al final).

## Estructura

```
apps/
  ground-control/   React — panel del centro de control (Ground API + Socket.IO)
  onboard/          React — interfaz de la tripulación (Onboard API)
services/
  ground-api/       Express + Socket.IO — API terrestre
  onboard-api/      Express — API de la nave, simulador de telemetría y del enlace
packages/
  shared/           Contratos: esquemas Zod, eventos Socket.IO, constantes
  ui/               Biblioteca de interfaz compartida: tema, componentes, capa de datos
scripts/e2e/        Prueba E2E reproducible (controlador de navegador sin dependencias)
docs/               Documentación técnica
```

## Documentación

- [Arquitectura y decisiones](docs/README.md)
- [Interfaces (frontend)](docs/frontend.md): `packages/ui`, pantallas, datos, accesibilidad y rendimiento
- [Comunicaciones nave–Tierra](docs/communications.md): HTTP, Socket.IO y simulación del enlace
- [Modelos y contratos](docs/models.md)
- [Alertas y dimensiones de fatiga y estrés](docs/alerts.md): reglas demostrativas, deduplicación e indicadores
- [Procedimiento de demostración](docs/demo.md)

## Stack

JavaScript + JSX (sin TypeScript) · React 19 · React Router 7 · Vite 8 · Tailwind CSS v4 · shadcn/ui (JSX) · Recharts · Express 5 · Socket.IO · Zod 4 · Vitest · npm workspaces · ESLint 10.
