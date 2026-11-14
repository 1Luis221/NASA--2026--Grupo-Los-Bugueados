# Astronaut Wellness System

Sistema de monitoreo del bienestar de astronautas durante misiones espaciales, desarrollado para el **NASA Space Apps Challenge 2026**.

El sistema se compone de dos entornos que se comunican entre sí:

- **A bordo (onboard):** interfaz para la tripulación y una API local en la nave.
- **Tierra (ground):** panel del centro de control y una API terrestre.

## Requisitos

- Node.js **>= 22.12** (ver `engines` en `package.json`)
- npm >= 10

## Puesta en marcha

```bash
npm install      # instala y enlaza todos los workspaces
npm run dev      # levanta las 2 APIs y los 2 frontends en paralelo
```

| Servicio | Workspace | URL |
|---|---|---|
| Ground Control (UI) | `apps/ground-control` | http://localhost:5173 |
| Onboard (UI) | `apps/onboard` | http://localhost:5174 |
| Ground API | `services/ground-api` | http://localhost:4000/health |
| Onboard API | `services/onboard-api` | http://localhost:4001/health |

Los puertos están definidos en un único lugar: [`packages/shared/src/constants.js`](packages/shared/src/constants.js). Vite usa `strictPort`, por lo que si un puerto está ocupado el arranque falla en lugar de cambiar de puerto silenciosamente.

## Scripts

| Comando | Descripción |
|---|---|
| `npm run dev` | APIs + frontends en paralelo (`concurrently`) |
| `npm run dev:apis` | Solo las dos APIs |
| `npm run dev:ground-api` / `dev:onboard-api` | Una API concreta (con `node --watch`) |
| `npm run dev:ground-ui` / `dev:onboard-ui` | Un frontend concreto |
| `npm run build` | Build de producción de todos los workspaces que lo definan |
| `npm run lint` / `lint:fix` | ESLint sobre todo el monorepo |
| `npm test` | Pruebas unitarias (Vitest) de todos los workspaces |

## Estructura

```
apps/
  ground-control/   React + Vite — panel del centro de control
  onboard/          React + Vite — interfaz de la tripulación
services/
  ground-api/       Node.js + Express — API terrestre
  onboard-api/      Node.js + Express — API de la nave
packages/
  shared/           Constantes, esquemas y utilidades compartidas (ESM)
docs/               Documentación del proyecto
```

## Stack

JavaScript + JSX (sin TypeScript) · React 19 · Vite 8 · Tailwind CSS v4 · Express 5 · Zod 4 · Vitest · npm workspaces · ESLint 10.

Más detalles en [`docs/`](docs/README.md).
