# Documentación técnica

## Arquitectura

```
┌──────────────────────┐        enlace espacio-tierra        ┌──────────────────────┐
│  apps/onboard (5174) │                                     │ apps/ground-control  │
│        React         │                                     │     (5173) React     │
└──────────┬───────────┘                                     └──────────┬───────────┘
           │ /api (proxy Vite)                       /api + /socket.io (proxy Vite)
┌──────────▼───────────┐  HTTP: SyncEvent → / ← SyncAck        ┌────────▼─────────────┐
│ services/onboard-api ├──── (enlace simulado, reintentos) ───►│ services/ground-api  │
│    Express (4001)    │                                       │ Express + Socket.IO  │
└──────────────────────┘                                       │       (4000)         │
                                                               └──────────────────────┘
                 ▲                                                   ▲
                 └────────── packages/shared (constantes, esquemas) ─┘
```

- Cada frontend habla **solo con su API** a través del proxy `/api` de Vite (sin CORS en desarrollo). La URL de destino se puede sobrescribir con `GROUND_API_URL` / `ONBOARD_API_URL`.
- `packages/shared` es ESM puro e isomórfico (navegador y Node): no debe importar módulos exclusivos de Node ni de React.
- Los modelos de datos, sus reglas de validación y los eventos Socket.IO están documentados en [models.md](models.md).
- La sincronización nave–Tierra, el simulador del enlace, los endpoints y los eventos en tiempo real están en [communications.md](communications.md).

## Convenciones de las APIs

```
src/
  server.js           arranque: abre el puerto, start()/stop() y gestiona señales
  context.js          compone todos los módulos; dependencias inyectables (reloj, azar, logger…)
  app.js              createApp(ctx): construye la app Express sin escuchar (testeable)
  config.js           loadConfig(env): configuración a partir de variables de entorno
  routes/             routers Express (*.routes.js) y esquemas de consulta
  controllers/        traducen HTTP ↔ servicios, sin lógica de negocio
  services/           lógica de negocio (*.service.js)
  repositories/       almacenes en memoria
  middleware/         errores (HttpError), 404, validación con Zod
  lib/runtime.js      reloj, logger y utilidades
  # solo onboard-api:  sync/ (cola, despachador, backoff, cliente HTTP), link/, simulator/, data/
  # solo ground-api:   realtime/ (Socket.IO), ground-server.js (HTTP + Socket.IO)
test/                 Vitest + Supertest; sin servicios externos (puertos efímeros locales)
```

- `GET /health` → `{ status, service, uptime, timestamp, … }`.
- Las rutas de negocio van bajo `/api` (`API_PREFIX` en shared). Datos entrantes en modo tolerante; registros propios en modo estricto.
- Variables de entorno opcionales en `.env` (ver `.env.example` de cada servicio). Se cargan con `node --env-file-if-exists`, sin `dotenv`.

## Convenciones de los frontends

- Alias `@/` → `src/` (configurado en `vite.config.js` y `jsconfig.json`; preparado para shadcn/ui).
- Estilos con Tailwind CSS v4 vía `@tailwindcss/vite`; el punto de entrada es `src/index.css`.

## Decisiones

| Decisión | Motivo |
|---|---|
| JavaScript/JSX, sin TypeScript | Restricción del equipo para el hackathon |
| npm workspaces | Sin herramientas extra; enlaces locales entre paquetes |
| Vite y Tailwind por app; ESLint centralizado en la raíz | Cada app controla su build; una sola configuración de lint para navegador y Node |
| Express 5 | Manejo nativo de errores en handlers `async` |
| Puertos en `shared/constants.js` | Fuente única de verdad, evita conflictos |
| Nave → tierra por HTTP; Socket.IO solo tierra → dashboard | Un único mecanismo de sincronización, con acuses explícitos |
| Almacenamiento en memoria | Sin bases de datos en esta fase; se pierde al reiniciar |

## Hoja de ruta

- **Fase 0** — Saneamiento del monorepo ✅
- **Fase 1** — Modelos y contratos compartidos en `packages/shared` (Zod, eventos) + tests ✅
- **Fase 2** — Backend y comunicaciones nave–Tierra: telemetría simulada, check-ins, cola con reintentos, enlace simulado, Socket.IO ✅
- **Fase 3** — UI base: shadcn/ui, layout, rutas
- **Fase 4** — MVP funcional de ambas interfaces
- **Fase 5** — Extras: MediaPipe, persistencia, documentación para el jurado
