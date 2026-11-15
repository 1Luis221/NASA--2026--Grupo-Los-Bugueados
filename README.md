# Astronaut Wellness System

Sistema de monitoreo del bienestar de astronautas durante misiones espaciales, desarrollado para el **NASA Space Apps Challenge 2026**.

Dos entornos que se comunican a través de un **enlace nave–Tierra simulado**:

- **A bordo:** interfaz de la tripulación (**Onboard**) y una API local en la nave (**Onboard API**).
- **Tierra:** panel del centro de control (**Ground Control**) y una API terrestre (**Ground API**).

> **Importante**
> - **Todos los datos y la cola de sincronización se guardan en memoria.** No hay base de datos: al reiniciar una API se pierde lo que tenía y **no existe garantía de recuperación**.
> - **Las constantes vitales son simuladas** por Onboard API y la interfaz las marca siempre como «Simulado». No son mediciones médicas reales, no se clasifican como normales o anormales y el sistema **no realiza diagnósticos**.
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
| `npm run a11y:contrast` | Mide el contraste WCAG 2.2 de los tokens del tema oscuro |

### Prueba E2E reproducible: `npm run e2e:demo`

Ejecuta el flujo crítico en Edge/Chrome *headless* sobre una **pila propia en puertos aislados** (APIs 4100/4101, interfaces 5273/5274) y la detiene al terminar, sin tocar los procesos de `npm run dev`:

1. selecciona una astronauta en Onboard, 2. desconecta el enlace simulado, 3. registra una autoevaluación, 4. comprueba que queda pendiente, 5. verifica que Tierra aún no la tiene, 6. reconecta, 7. comprueba la sincronización automática, 8. comprueba que Ground Control la muestra sin recargar, 9. restaura el enlace.

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
- [Procedimiento de demostración](docs/demo.md)

## Stack

JavaScript + JSX (sin TypeScript) · React 19 · React Router 7 · Vite 8 · Tailwind CSS v4 · shadcn/ui (JSX) · Recharts · Express 5 · Socket.IO · Zod 4 · Vitest · npm workspaces · ESLint 10.
