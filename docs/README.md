# Documentación técnica

## Arquitectura

```
┌──────────────────────┐        enlace espacio-tierra        ┌──────────────────────┐
│  apps/onboard (5174) │                                     │ apps/ground-control  │
│        React         │                                     │     (5173) React     │
└──────────┬───────────┘                                     └──────────┬───────────┘
           │ /api (proxy Vite)                                          │ /api (proxy Vite)
┌──────────▼───────────┐   (latencia simulada, fases futuras)  ┌────────▼─────────────┐
│ services/onboard-api ├──────────────────────────────────────►│ services/ground-api  │
│    Express (4001)    │                                       │    Express (4000)    │
└──────────────────────┘                                       └──────────────────────┘
                 ▲                                                   ▲
                 └────────── packages/shared (constantes, esquemas) ─┘
```

- Cada frontend habla **solo con su API** a través del proxy `/api` de Vite (sin CORS en desarrollo). La URL de destino se puede sobrescribir con `GROUND_API_URL` / `ONBOARD_API_URL`.
- `packages/shared` es ESM puro e isomórfico (navegador y Node): no debe importar módulos exclusivos de Node ni de React.
- Los modelos de datos, sus reglas de validación y los eventos Socket.IO están documentados en [models.md](models.md).

## Convenciones de las APIs

```
src/
  server.js           arranque: abre el puerto y gestiona señales
  app.js              createApp(): construye la app Express sin escuchar (testeable)
  config.js           configuración a partir de variables de entorno
  routes/             routers Express (*.routes.js)
  middleware/         middlewares transversales (errores, 404…)
```

- `GET /health` → `{ status, service, uptime, timestamp }`.
- Las rutas de negocio se montarán bajo `/api` (`API_PREFIX` en shared).
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

## Hoja de ruta

- **Fase 0** — Saneamiento del monorepo ✅
- **Fase 1** — Modelos y contratos compartidos en `packages/shared` (Zod, eventos) + tests ✅
- **Fase 2** — APIs: telemetría simulada, check-ins, enlace con latencia simulada, Socket.IO
- **Fase 3** — UI base: shadcn/ui, layout, rutas
- **Fase 4** — MVP funcional de ambas interfaces
- **Fase 5** — Extras: MediaPipe, persistencia, documentación para el jurado
