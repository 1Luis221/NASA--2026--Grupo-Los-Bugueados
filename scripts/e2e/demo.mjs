#!/usr/bin/env node
/**
 * npm run e2e:demo — flujo crítico de demostración, reproducible y comprobado.
 *
 *   Onboard (UI) → Onboard API → [enlace simulado] → Ground API → Ground Control (UI)
 *
 * Por defecto levanta una pila PROPIA en puertos aislados (APIs 4100/4101, UIs
 * 5273/5274) y la detiene al terminar: no toca los procesos habituales.
 *
 *   npm run e2e:demo                 pila aislada (recomendado)
 *   npm run e2e:demo -- --attach     usa la pila ya arrancada en 4000/4001/5173/5174.
 *                                    Crea una autoevaluación de prueba y alterna el
 *                                    enlace simulado (se restaura al final).
 *
 * Códigos de salida: 0 éxito · 1 fallo de un paso · 2 prerrequisitos · 130 interrumpido.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBrowser, launchBrowser } from './edge-driver.mjs'
import { StepError, createProcessRegistry, getFreePort, isPortFree, poll, runSteps, sleep } from './lib.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ATTACH = process.argv.includes('--attach')
const PORTS = ATTACH
  ? { groundApi: 4000, onboardApi: 4001, groundUi: 5173, onboardUi: 5174 }
  : { groundApi: 4100, onboardApi: 4101, groundUi: 5273, onboardUi: 5274 }
const URLS = {
  groundApi: `http://localhost:${PORTS.groundApi}/api`,
  onboardApi: `http://localhost:${PORTS.onboardApi}/api`,
  groundUi: `http://localhost:${PORTS.groundUi}`,
  onboardUi: `http://localhost:${PORTS.onboardUi}`,
}
const CREW = { id: '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d', name: 'Ana Torres' }
const STORAGE_KEY = 'astronaut-wellness.onboard.selectedCrewId'
const MARKER = `E2E demo ${new Date().toISOString().slice(0, 19)}Z`

const log = (...args) => console.log(...args)
const ok = (label, value) => log(`  ✔ ${label}${value === undefined ? '' : `: ${value}`}`)
const getJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`)
  return response.json()
}
const putJson = (url, body) =>
  fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const linkState = async () => (await getJson(`${URLS.onboardApi}/sync/status`)).data.link.state

const registry = createProcessRegistry({ log })
const ctx = { browser: null, onboard: null, ground: null, initialLink: null, checkIn: null }

// ---------------------------------------------------------------------------
// Limpieza garantizada (también ante Ctrl+C o errores no capturados)
// ---------------------------------------------------------------------------
let cleaning = null
function cleanup() {
  cleaning ??= (async () => {
    if (ctx.initialLink) {
      try {
        if ((await linkState()) !== ctx.initialLink) await putJson(`${URLS.onboardApi}/dev/link`, { state: ctx.initialLink })
        log(`\nEnlace simulado restaurado a: ${await linkState()}`)
      } catch (error) {
        log(`\n⚠ No se pudo restaurar el enlace: ${error.message}`)
      }
    }
    const startedSomething = registry.size() > 0 || ctx.browser
    try {
      await ctx.browser?.close()
    } catch {
      /* el registro detiene el proceso igualmente */
    }
    await registry.stopAll()
    if (!startedSomething) log('No se llegó a iniciar ningún proceso.')
    else log(ATTACH ? 'Navegador cerrado. La pila existente no se ha detenido.' : 'Navegador y pila aislada detenidos.')
  })()
  return cleaning
}
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  process.once(signal, () => {
    log(`\n${signal} recibido: limpiando…`)
    cleanup().finally(() => process.exit(code))
  })
}

// ---------------------------------------------------------------------------
// Prerrequisitos y pila
// ---------------------------------------------------------------------------
async function checkPrerequisites() {
  const [major, minor] = process.versions.node.split('.').map(Number)
  if (major < 22 || (major === 22 && minor < 12)) throw new Error(`Se necesita Node.js ≥ 22.12 (actual ${process.versions.node})`)
  if (!findBrowser()) throw new Error('No se encontró Microsoft Edge ni Google Chrome (define E2E_BROWSER con la ruta)')
  if (!existsSync(path.join(ROOT, 'node_modules/vite/bin/vite.js'))) throw new Error('Faltan dependencias: ejecuta npm install')
  if (ATTACH) {
    for (const [name, url] of Object.entries({ 'Ground API': URLS.groundApi, 'Onboard API': URLS.onboardApi })) {
      await getJson(`${url}/sync/${name === 'Ground API' ? 'stats' : 'status'}`).catch(() => {
        throw new Error(`--attach: ${name} no responde en ${url}`)
      })
    }
    for (const [name, url] of [['Ground Control', URLS.groundUi], ['Onboard', URLS.onboardUi]]) {
      await fetch(url).catch(() => {
        throw new Error(`--attach: ${name} no responde en ${url}`)
      })
    }
    return 'pila existente disponible'
  }
  const busy = []
  for (const port of Object.values(PORTS)) if (!(await isPortFree(port))) busy.push(port)
  if (busy.length) throw new Error(`Puertos ocupados para la pila aislada: ${busy.join(', ')}. Libéralos o usa --attach.`)
  return `puertos libres: ${Object.values(PORTS).join(', ')}`
}

async function startIsolatedStack() {
  const node = process.execPath
  const vite = path.join(ROOT, 'node_modules/vite/bin/vite.js')
  const env = (extra) => ({ ...process.env, NODE_ENV: 'development', ...extra })
  registry.start('ground-api', node, ['services/ground-api/src/server.js'], { cwd: ROOT, env: env({ PORT: String(PORTS.groundApi) }) })
  registry.start('onboard-api', node, ['services/onboard-api/src/server.js'], {
    cwd: ROOT,
    // Sin telemetría automática: el flujo es determinista. Envío rápido y backoff corto.
    env: env({ PORT: String(PORTS.onboardApi), GROUND_API_URL: `http://localhost:${PORTS.groundApi}`, TELEMETRY_INTERVAL_MS: '0', SYNC_INTERVAL_MS: '500', SYNC_BACKOFF_MAX_MS: '2000' }),
  })
  registry.start('ground-control', node, [vite, '--port', String(PORTS.groundUi), '--strictPort'], {
    cwd: path.join(ROOT, 'apps/ground-control'),
    env: env({ GROUND_API_URL: `http://localhost:${PORTS.groundApi}` }),
  })
  registry.start('onboard', node, [vite, '--port', String(PORTS.onboardUi), '--strictPort'], {
    cwd: path.join(ROOT, 'apps/onboard'),
    env: env({ ONBOARD_API_URL: `http://localhost:${PORTS.onboardApi}` }),
  })
  for (const [name, url] of [
    ['Ground API', `${URLS.groundApi}/sync/stats`],
    ['Onboard API', `${URLS.onboardApi}/sync/status`],
    ['Ground Control', URLS.groundUi],
    ['Onboard', URLS.onboardUi],
  ]) {
    await poll(() => fetch(url).then((r) => r.ok), { timeout: 60_000, label: `${name} (${url})` })
  }
}

// ---------------------------------------------------------------------------
// Flujo crítico
// ---------------------------------------------------------------------------
const steps = [
  {
    title: 'Comprobar prerrequisitos',
    run: async () => ok('Entorno', await checkPrerequisites()),
  },
  {
    title: ATTACH ? 'Conectar con la pila existente (--attach)' : 'Iniciar pila aislada',
    run: async () => {
      if (!ATTACH) await startIsolatedStack()
      ctx.initialLink = await linkState()
      ok('Servicios', Object.values(URLS).join(' · '))
      ok('Enlace simulado inicial', ctx.initialLink)
    },
  },
  {
    title: 'Abrir Ground Control y Onboard',
    run: async () => {
      ctx.browser = await launchBrowser({ port: await getFreePort(), registry })
      ctx.ground = await ctx.browser.newPage()
      ctx.onboard = await ctx.browser.newPage()
      await ctx.ground.viewport(1440, 900)
      await ctx.ground.goto(`${URLS.groundUi}/`)
      await ctx.ground.waitForText((t) => t.includes('Tiempo real: conectado') && t.includes('Tripulantes conocidos'), {
        timeout: 60_000,
        label: 'Ground Control cargado y conectado por Socket.IO',
      })
      await ctx.onboard.viewport(1440, 900)
      await ctx.onboard.goto(`${URLS.onboardUi}/`)
      await ctx.onboard.waitForText((t) => t.includes('Tripulante'), { timeout: 60_000, label: 'Onboard cargado' })
      await ctx.onboard.evaluate(`localStorage.removeItem(${JSON.stringify(STORAGE_KEY)})`)
      await ctx.onboard.goto(`${URLS.onboardUi}/`)
      await ctx.onboard.waitForText((t) => t.includes('Ningún tripulante seleccionado'), { label: 'Onboard sin selección' })
      ok('Ground Control y Onboard listos')
    },
  },
  {
    title: 'Seleccionar un astronauta (teclado)',
    run: async () => {
      await ctx.onboard.focus('header [role="combobox"]')
      await ctx.onboard.key('Enter')
      await ctx.onboard.waitForText((t) => t.includes(`${CREW.name} (Nova)`), { label: 'lista de tripulantes abierta' })
      await ctx.onboard.key('Enter')
      await ctx.onboard.waitForText((t) => /Tripulante seleccionado\s+Ana Torres/.test(t), { label: 'Ana Torres seleccionada' })
      ok('Seleccionada y recordada', await ctx.onboard.evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`))
    },
  },
  {
    title: 'Desconectar el enlace (pantalla Simulación)',
    run: async () => {
      await ctx.onboard.click('nav a', 'Simulación')
      await ctx.onboard.waitForText((t) => t.includes('Controles de simulación (solo en desarrollo)') && t.includes('Forzar envío de pendientes'), {
        label: 'pantalla de simulación',
      })
      await ctx.onboard.click('button', 'Desconectado')
      await ctx.onboard.waitForText((t) => t.includes('Cambiar enlace a desconectado: completado'), { label: 'respuesta de la API' })
      const state = await linkState()
      if (state !== 'disconnected') throw new Error(`Onboard API informa «${state}»`)
      ok('Enlace simulado', state)
    },
  },
  {
    title: 'Registrar una autoevaluación',
    run: async () => {
      await ctx.onboard.click('nav a', 'Autoevaluación')
      await ctx.onboard.waitForText((t) => t.includes(`Nueva autoevaluación · ${CREW.name}`), { label: 'formulario' })
      for (const [name, value] of [['mood', 4], ['stress', 2], ['fatigue', 3], ['sleepQuality', 4]]) {
        await ctx.onboard.evaluate(`document.querySelector('input[name="${name}"][value="${value}"]').click()`)
      }
      await ctx.onboard.focus('textarea[name="notes"]')
      await ctx.onboard.type(MARKER)
      await ctx.onboard.click('button[type="submit"]')
      await ctx.onboard.waitForText((t) => t.includes('Autoevaluación guardada en Onboard API') && t.includes('Respuesta HTTP 201'), {
        label: 'confirmación HTTP 201',
      })
      const list = await getJson(`${URLS.onboardApi}/check-ins?crewMemberId=${CREW.id}&limit=20`)
      ctx.checkIn = list.data.find((c) => c.notes === MARKER)
      if (!ctx.checkIn) throw new Error('La autoevaluación no aparece en Onboard API')
      ok('Guardada en Onboard API (201)', ctx.checkIn.id)
    },
  },
  {
    title: 'Comprobar que queda pendiente de sincronización',
    run: async () => {
      await ctx.onboard.waitForText((t) => /Sincronización con Tierra:\s*Pendiente de envío/.test(t), { label: 'estado «Pendiente de envío»' })
      const pending = await getJson(`${URLS.onboardApi}/sync/events?status=pending&limit=500`)
      const event = pending.data.find((e) => e.entityId === ctx.checkIn.id)
      if (!event) throw new Error('El evento no está en la cola como pendiente')
      ok('Interfaz y cola real', `pendiente (evento #${event.sequence})`)
    },
  },
  {
    title: 'Verificar que Tierra aún no la recibió',
    run: async () => {
      // Se observa durante varios ciclos del despachador (500 ms) para que la comprobación sea significativa.
      for (let i = 0; i < 6; i++) {
        const received = (await getJson(`${URLS.groundApi}/check-ins?limit=100`)).data.some((c) => c.id === ctx.checkIn.id)
        if (received) throw new Error('Ground API recibió el dato con el enlace desconectado')
        if ((await ctx.ground.text()).includes(MARKER)) throw new Error('Ground Control muestra el dato con el enlace desconectado')
        await sleep(500)
      }
      ok('Ni Ground API ni Ground Control la tienen (3 s de observación)')
    },
  },
  {
    title: 'Reconectar el enlace (pantalla Simulación)',
    run: async () => {
      await ctx.onboard.click('nav a', 'Simulación')
      await ctx.onboard.waitForText((t) => t.includes('Forzar envío de pendientes'), { label: 'pantalla de simulación' })
      ctx.reconnectedAt = Date.now()
      await ctx.onboard.click('button', 'Conectado')
      await ctx.onboard.waitForText((t) => t.includes('Cambiar enlace a conectado: completado'), { label: 'respuesta de la API' })
      ok('Enlace simulado', await linkState())
    },
  },
  {
    title: 'Comprobar la sincronización automática (sin forzar el envío)',
    run: async () => {
      await poll(async () => (await getJson(`${URLS.groundApi}/check-ins?limit=100`)).data.some((c) => c.id === ctx.checkIn.id), {
        timeout: 20_000,
        label: 'llegada a Ground API',
      })
      ok('Recibida por Ground API', `${Date.now() - ctx.reconnectedAt} ms tras reconectar`)
      await ctx.onboard.click('nav a', 'Autoevaluación')
      await ctx.onboard.waitForText((t) => t.includes(MARKER) && t.includes('Recibido por Tierra'), {
        label: 'historial de Onboard con «Recibido por Tierra» (evidencia de la cola)',
      })
      ok('Onboard muestra «Recibido por Tierra» con evidencia')
    },
  },
  {
    title: 'Comprobar que Ground Control se actualiza sin refrescar',
    run: async () => {
      const { ms } = await ctx.ground.waitForText((t) => t.includes(MARKER), { timeout: 15_000, label: 'autoevaluación visible en Ground Control' })
      const navigations = await ctx.ground.evaluate('performance.getEntriesByType("navigation").length')
      ok('Visible en Ground Control', `${ms} ms (misma carga de página: ${navigations} navegación)`)
    },
  },
  {
    title: 'Restaurar el enlace a su configuración original',
    run: async () => {
      if ((await linkState()) !== ctx.initialLink) await putJson(`${URLS.onboardApi}/dev/link`, { state: ctx.initialLink })
      const state = await linkState()
      if (state !== ctx.initialLink) throw new Error(`El enlace quedó en «${state}»`)
      ok('Enlace simulado', state)
    },
  },
]

let exitCode = 0
try {
  log(`Demostración E2E · modo ${ATTACH ? 'pila existente (--attach)' : 'pila aislada'}`)
  await runSteps(steps, ctx, log)
  log('\n✔ Flujo crítico completado: todas las comprobaciones son correctas.')
} catch (error) {
  exitCode = error instanceof StepError && error.step === 1 ? 2 : 1
  log(`\n✘ ${error.message}`)
} finally {
  await cleanup()
}
process.exit(exitCode)
