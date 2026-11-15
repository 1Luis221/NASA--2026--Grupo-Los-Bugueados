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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findBrowser, launchBrowser } from './edge-driver.mjs'
import { PVT_DEFAULT_PROTOCOL, classifyPvtTrial, summarizePvtTrials } from '@astronaut-wellness/shared'
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
/** Capturas opcionales: E2E_SCREENSHOTS=<carpeta>. */
async function screenshot(page, name) {
  const dir = process.env.E2E_SCREENSHOTS
  if (!dir) return
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, `${name}.png`), await page.screenshot())
  } catch (error) {
    log(`  ⚠ Captura «${name}» omitida: ${error.message}`) // opcional: nunca hace fallar el flujo
  }
}
const ok = (label, value) => log(`  ✔ ${label}${value === undefined ? '' : `: ${value}`}`)
const getJson = async (url) => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`)
  return response.json()
}
const putJson = (url, body) =>
  fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const linkState = async () => (await getJson(`${URLS.onboardApi}/sync/status`)).data.link.state
const postJson = async (url, body, headers = {}) => {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
  const json = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}: ${JSON.stringify(json?.issues ?? json?.error ?? json).slice(0, 300)}`)
  return json
}

/** PVT válida (mismo cálculo que el contrato) a partir de tiempos de reacción. */
function pvtBody(rts) {
  const protocol = { ...PVT_DEFAULT_PROTOCOL }
  const trials = rts.map((rt, index) => {
    const t = { index, stimulusOffsetMs: 1500 + index * 2500, reactionTimeMs: rt }
    return { ...t, outcome: classifyPvtTrial(t, protocol) }
  })
  return { crewMemberId: CREW.id, testType: 'pvt', protocol, trials, summary: summarizePvtTrials(trials, protocol) }
}

/** FIXTURE de métricas de cámara: valida el flujo de datos, NO prueba el hardware ni el modelo. */
const cameraFixture = () => ({
  crewMemberId: CREW.id,
  windowDuration: { value: 30, unit: 's' },
  faceDetected: true,
  model: { name: 'e2e-fixture', version: '0.0.0' },
  blinkRate: { value: 14, unit: 'blinks/min' },
  eyeClosureRatio: { value: 0.12, unit: 'ratio' },
  yawnCount: { value: 0, unit: 'count' },
})

/** Cabecera de los datos de prueba enviados por API: Onboard API los guarda como SIMULADOS (solo en desarrollo). */
const FIXTURE = { 'X-Data-Fixture': '1' }

/** Comprueba que cada id aparece exactamente una vez en una lista de Ground API. */
async function expectOnceInGround(resource, ids) {
  const list = (await getJson(`${URLS.groundApi}/${resource}?limit=500`)).data
  for (const id of ids) {
    const n = list.filter((r) => r.id === id).length
    if (n !== 1) throw new Error(`${resource}: el registro ${id} aparece ${n} veces en Ground API`)
  }
  return list
}

const registry = createProcessRegistry({ log })
const ctx = { browser: null, onboard: null, ground: null, initialLink: null, checkIn: null, b2: { ids: {} } }

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
  // -------------------------------------------------------------------------
  // Bloque 2: fatiga, respuesta al estrés, alertas y almacenamiento con reenvío
  // -------------------------------------------------------------------------
  {
    title: 'B2 · Prueba PVT en la interfaz Onboard (protocolo de demostración, respuestas automatizadas)',
    run: async () => {
      await ctx.onboard.click('nav a', 'Vigilancia')
      await ctx.onboard.waitForText((t) => t.includes('Iniciar prueba'), { label: 'pantalla de vigilancia' })
      await ctx.onboard.evaluate(`document.querySelector('input[name="pvt-protocol"][value="demo"]').click()`)
      await ctx.onboard.click('button', 'Iniciar prueba')
      // Respondedor AUTOMATIZADO dentro de la página: pulsa la barra espaciadora ~230 ms después de cada estímulo.
      await ctx.onboard.evaluate(`window.__pvtBot = setInterval(() => {
        const b = document.querySelector('button[aria-label^="Zona de respuesta"]')
        if (b && b.textContent.includes('¡AHORA!') && !window.__pvtBusy) {
          window.__pvtBusy = true
          setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })); window.__pvtBusy = false }, 230)
        }
      }, 5)`)
      const { ms } = await ctx.onboard.waitForText((t) => t.includes('Prueba terminada'), { timeout: 90_000, label: 'fin de la prueba (60 s)' })
      await ctx.onboard.evaluate('clearInterval(window.__pvtBot)')
      if (!(await ctx.onboard.text()).includes('Respuestas automatizadas')) throw new Error('La interfaz no avisa de que las respuestas son automatizadas')
      await ctx.onboard.click('button', 'Enviar resultado')
      await ctx.onboard.waitForText((t) => t.includes('Resultado guardado en Onboard API') && t.includes('Respuesta HTTP 201'), { label: 'HTTP 201 de la prueba' })
      const test = (await getJson(`${URLS.onboardApi}/vigilance-tests?crewMemberId=${CREW.id}&limit=1`)).data[0]
      if (!test || test.protocol.name !== 'PVT-demo' || test.summary.validCount === 0) throw new Error('La prueba no se guardó como se esperaba')
      // Respuestas de un script → dato SIMULADO, nunca «Dato real».
      if (test.source.simulated !== true || test.source.deviceId !== 'e2e-fixture') throw new Error(`Procedencia incorrecta: ${JSON.stringify(test.source)}`)
      ctx.b2.ids.pvt1 = test.id
      ok(
        `Prueba completada en ${Math.round(ms / 1000)} s y guardada en Onboard API (201)`,
        `guardada como SIMULADA (respuestas automatizadas) · ${test.summary.trialCount} ensayos · ${test.summary.validCount} válidos · ${test.summary.lapseCount} lapsos · TR medio ${test.summary.meanReactionTimeMs} ms`,
      )
    },
  },
  {
    title: 'B2 · Fatiga (autoevaluación con KSS y sueño), estrés (telemetría simulada) y cámara (FIXTURE)',
    run: async () => {
      const body = { crewMemberId: CREW.id, mood: 3, stress: 4, fatigue: 4, sleepQuality: 2, sleepiness: 8, sleepDuration: { value: 5, unit: 'h' }, notes: `${MARKER} B2` }
      const checkIn = (await postJson(`${URLS.onboardApi}/check-ins`, body)).data
      ctx.b2.ids.checkIn1 = checkIn.id
      ok('Autoevaluación (fatiga 4/5, KSS 8/9, 5 h de sueño, estrés 4/5)', checkIn.id)
      const vitals = (await postJson(`${URLS.onboardApi}/dev/telemetry/tick`)).data.find((v) => v.crewMemberId === CREW.id)
      ctx.b2.ids.vitals1 = vitals.id
      ok('Telemetría SIMULADA (FC, HRV RMSSD, actividad)', `${vitals.heartRate.value} lpm · ${vitals.heartRateVariability.value} ms · ${vitals.activityLevel.value} MET`)
      const camera = (await postJson(`${URLS.onboardApi}/camera-metrics`, cameraFixture(), FIXTURE)).data
      ctx.b2.ids.camera1 = camera.id
      if (camera.source.simulated !== true) throw new Error('El fixture de cámara no quedó marcado como simulado')
      ok('Métricas de cámara desde un FIXTURE, guardadas como «Simulado» (no prueban el hardware)', camera.id)
    },
  },
  {
    title: 'B2 · Alerta demostrativa generada a bordo',
    run: async () => {
      const alerts = (await getJson(`${URLS.onboardApi}/alerts?crewMemberId=${CREW.id}&limit=50`)).data
      const sleepiness = alerts.find((a) => a.rule?.id === 'demo.sleepiness.self_report' && a.status === 'active')
      if (!sleepiness) throw new Error('No se generó la alerta de somnolencia autodeclarada')
      if (!sleepiness.rule.demonstrative || sleepiness.evidence?.[0]?.id !== ctx.b2.ids.checkIn1) throw new Error('La alerta no identifica su regla demostrativa y su evidencia')
      ctx.b2.ids.alertSleepiness = sleepiness.id
      ok('Alerta', `«${sleepiness.title}» · regla ${sleepiness.rule.id} (demostrativa) · evidencia: ${sleepiness.evidence[0].summary}`)
    },
  },
  {
    title: 'B2 · Recepción en Ground API y visualización en Ground Control',
    run: async () => {
      const ids = ctx.b2.ids
      // Se espera a TODOS los registros (la cola los envía en orden, pero no a la vez).
      await poll(
        async () => {
          await expectOnceInGround('alerts', [ids.alertSleepiness])
          await expectOnceInGround('vigilance-tests', [ids.pvt1])
          await expectOnceInGround('check-ins', [ids.checkIn1])
          await expectOnceInGround('vitals', [ids.vitals1])
          await expectOnceInGround('camera-metrics', [ids.camera1])
          return true
        },
        { timeout: 20_000, label: 'registros del bloque 2 en Ground API (una vez cada uno)' },
      )
      ok('Ground API tiene la PVT, la autoevaluación, la telemetría, las métricas y la alerta (una vez cada una)')

      await ctx.ground.goto(`${URLS.groundUi}/crew/${CREW.id}`)
      await ctx.ground.waitForText(
        (t) =>
          t.includes('Tiempo real: conectado') &&
          t.includes('8/9') &&
          t.includes('PVT-demo') &&
          t.includes('e2e-fixture 0.0.0') &&
          t.includes('Respuesta al estrés') &&
          t.includes('Somnolencia autodeclarada elevada') &&
          t.includes('Regla demostrativa'),
        { timeout: 30_000, label: 'detalle del tripulante con fatiga, estrés, PVT, cámara y alerta' },
      )
      ctx.groundNavigations = await ctx.ground.evaluate('performance.getEntriesByType("navigation").length')
      if (process.env.E2E_SCREENSHOTS) {
        await ctx.ground.viewport(1440, 1800)
        await ctx.ground.evaluate("document.querySelector('main')?.scrollTo?.(0, 0)")
        await sleep(500)
        await screenshot(ctx.ground, 'ground-crew-detail')
        await ctx.ground.viewport(1440, 900)
      }
      ok('Ground Control muestra fatiga (KSS 8/9), PVT-demo, cámara (fixture), respuesta al estrés y la alerta demostrativa')
    },
  },
  {
    title: 'B2 · Desconexión: los nuevos registros y alertas se acumulan a bordo',
    run: async () => {
      await putJson(`${URLS.onboardApi}/dev/link`, { state: 'disconnected' })
      if ((await linkState()) !== 'disconnected') throw new Error('El enlace no se desconectó')
      const ids = ctx.b2.ids
      // PVT con 6 lapsos → alerta demostrativa de lapsos.
      ids.pvt2 = (await postJson(`${URLS.onboardApi}/vigilance-tests`, pvtBody([...Array(20).fill(260), ...Array(6).fill(480)]), FIXTURE)).data.id
      // KSS bajo → se resuelve la alerta de somnolencia (actualización de la MISMA alerta).
      ids.checkIn2 = (await postJson(`${URLS.onboardApi}/check-ins`, { crewMemberId: CREW.id, mood: 4, stress: 2, fatigue: 2, sleepQuality: 4, sleepiness: 3 })).data.id
      ids.camera2 = (await postJson(`${URLS.onboardApi}/camera-metrics`, cameraFixture(), FIXTURE)).data.id
      ids.vitals2 = (await postJson(`${URLS.onboardApi}/dev/telemetry/tick`)).data.find((v) => v.crewMemberId === CREW.id).id
      const alerts = (await getJson(`${URLS.onboardApi}/alerts?crewMemberId=${CREW.id}&limit=50`)).data
      ids.alertLapses = alerts.find((a) => a.rule?.id === 'demo.pvt.lapses' && a.status === 'active')?.id
      if (!ids.alertLapses) throw new Error('No se generó la alerta de lapsos')
      if (alerts.find((a) => a.id === ids.alertSleepiness)?.status !== 'resolved') throw new Error('La alerta de somnolencia no se resolvió')

      const pending = (await getJson(`${URLS.onboardApi}/sync/events?status=pending&limit=500`)).data
      const waiting = new Set(pending.map((e) => e.entityId))
      const expected = { pvt2: ids.pvt2, checkIn2: ids.checkIn2, camera2: ids.camera2, vitals2: ids.vitals2, alertLapses: ids.alertLapses, alertSleepiness: ids.alertSleepiness }
      for (const [name, id] of Object.entries(expected)) if (!waiting.has(id)) throw new Error(`${name} no está pendiente en la cola`)
      ok('Pendientes en la cola de la nave', `${pending.length} eventos (PVT, autoevaluación, cámara, telemetría, alerta nueva y resolución de la anterior)`)
      for (let i = 0; i < 6; i++) {
        if ((await getJson(`${URLS.groundApi}/vigilance-tests?limit=500`)).data.some((t) => t.id === ids.pvt2)) throw new Error('Ground API recibió datos con el enlace desconectado')
        await sleep(500)
      }
      ok('Tierra no recibe nada mientras el enlace está desconectado (3 s de observación)')
    },
  },
  {
    title: 'B2 · Reconexión con fallos transitorios y recepción sin duplicados',
    run: async () => {
      const ids = ctx.b2.ids
      const statsBefore = (await getJson(`${URLS.groundApi}/sync/stats`)).data
      await postJson(`${URLS.onboardApi}/dev/link/failures`, { count: 2 }) // algunos envíos fallarán y se reintentarán
      await putJson(`${URLS.onboardApi}/dev/link`, { state: 'connected' })
      await poll(
        async () => {
          const byStatus = (await getJson(`${URLS.onboardApi}/sync/status`)).data.queue.byStatus
          return ['pending', 'sending', 'retry_scheduled', 'failed'].every((k) => (byStatus[k] ?? 0) === 0)
        },
        { timeout: 30_000, label: 'cola de la nave sin eventos pendientes' },
      )
      await expectOnceInGround('vigilance-tests', [ids.pvt1, ids.pvt2])
      await expectOnceInGround('check-ins', [ids.checkIn1, ids.checkIn2])
      await expectOnceInGround('camera-metrics', [ids.camera1, ids.camera2])
      await expectOnceInGround('vitals', [ids.vitals1, ids.vitals2])
      const alerts = await expectOnceInGround('alerts', [ids.alertSleepiness, ids.alertLapses])
      if (alerts.find((a) => a.id === ids.alertSleepiness).status !== 'resolved') throw new Error('Ground API no aplicó la resolución de la alerta')
      const openPerKey = new Map()
      for (const a of alerts.filter((x) => x.dedupKey && x.status !== 'resolved')) openPerKey.set(a.dedupKey, (openPerKey.get(a.dedupKey) ?? 0) + 1)
      if ([...openPerKey.values()].some((n) => n > 1)) throw new Error('Hay más de una alerta abierta para la misma regla y tripulante')
      const statsAfter = (await getJson(`${URLS.groundApi}/sync/stats`)).data
      if (statsAfter.rejected !== statsBefore.rejected) throw new Error('Ground API rechazó eventos')
      ok('Todo recibido exactamente una vez', 'PVT ×2, autoevaluaciones ×2, cámara ×2, telemetría ×2, alertas ×2 (una resuelta)')
      ok('Ground API', `aceptados +${statsAfter.accepted - statsBefore.accepted} · duplicados detectados y no reaplicados +${statsAfter.duplicate - statsBefore.duplicate} · rechazados +0`)

      await ctx.ground.waitForText((t) => t.includes('Lapsos frecuentes en la prueba de vigilancia'), { timeout: 20_000, label: 'alerta de lapsos en Ground Control' })
      const navigations = await ctx.ground.evaluate('performance.getEntriesByType("navigation").length')
      if (navigations !== ctx.groundNavigations) throw new Error('Ground Control se recargó')
      ok('Ground Control muestra la nueva alerta en tiempo real, sin recargar')
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
