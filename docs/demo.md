# Procedimiento de demostración

Muestra que la tripulación puede seguir registrando datos aunque se pierda el enlace con Tierra, y que se entregan solos al recuperarlo.

> Todo es **simulado y en memoria**: telemetría generada por Onboard API (marcada «Simulado»), enlace nave–Tierra simulado y almacenamiento que se pierde al reiniciar los procesos. No hay diagnósticos médicos.

## Opción A — Automática (recomendada para comprobar que todo funciona)

```bash
npm install
npm run e2e:demo
```

Levanta su propia pila en puertos aislados (4100/4101/5273/5274), ejecuta el flujo con un navegador *headless* y lo detiene todo al acabar. Cada paso se imprime con su resultado; si algo falla indica el paso y la causa y termina con código distinto de 0.

## Opción B — Manual, con las interfaces a la vista

1. `npm run dev` y abre **Onboard** (http://localhost:5174) y **Ground Control** (http://localhost:5173) en dos ventanas.
2. En Ground Control comprueba «Tiempo real: conectado» en el encabezado.
3. En Onboard elige un tripulante en el selector del encabezado.
4. Ve a **Simulación** y pulsa **Desconectado**. El encabezado muestra «Enlace simulado: desconectado».
5. Ve a **Autoevaluación**, rellena las cuatro escalas (y, si quieres, horas de sueño y notas) y pulsa **Guardar**.
6. Observa la confirmación: «Guardada en Onboard API (HTTP 201)» y «Sincronización con Tierra: Pendiente de envío».
7. En Ground Control la autoevaluación **no** aparece; en **Sincronización** el bloque C recuerda que el enlace no es verificable desde Tierra.
8. En Onboard › **Simulación**, pulsa **Conectado**. No hace falta forzar el envío: el despachador lo entrega solo.
9. En unos instantes, Ground Control muestra la autoevaluación en «Últimas autoevaluaciones» **sin recargar**, y en Onboard el historial pasa a «Recibido por Tierra».

Variantes útiles en **Simulación**: «Degradado» (latencia y pérdidas con reintentos), «Simular fallos» (reintentos con backoff, visibles en Sincronización) y «Generar una medición simulada».

## Qué no se puede demostrar todavía

- Persistencia: si se reinicia una API se pierden sus datos (Ground Control lo detecta y lo avisa).
- Métricas de cámara (MediaPipe pendiente): la pantalla de cámara es preparatoria.
- Confirmación por evento con la cola ocupada: ver «Bloqueo para la integración» en [frontend.md](frontend.md).
