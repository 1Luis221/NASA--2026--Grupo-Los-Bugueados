#!/usr/bin/env node
/**
 * npm run e2e:camera — validación de MediaPipe Face Landmarker en un navegador
 * REAL (Edge/Chrome headless), con el modelo y el runtime WASM reales.
 *
 * La cámara es la cámara SIMULADA de Chromium (--use-fake-device-for-media-stream):
 * getUserMedia y el flujo de vídeo son los reales del navegador, pero la imagen
 * procede de un archivo. Esto NO prueba una cámara física.
 *
 *   npm run e2e:camera                          patrón de prueba de Chromium (sin rostro)
 *   npm run e2e:camera -- --face foto.jpg       vídeo generado a partir de una foto con un rostro
 *                      [--crop x,y,w,h]         recorte 4:3 de la foto (por defecto, centrado)
 *                      [--out carpeta]          guarda capturas de pantalla
 *                      [--cpu]                  fuerza el delegado de CPU
 *                      [--simulate-no-webgl]    WebGL bloqueado: debe mostrarse un error claro, nunca «activeTexture»
 *
 * Pila propia en puertos aislados (Onboard API 4201, Onboard 5374). Las peticiones
 * a CDN externos se BLOQUEAN para comprobar que MediaPipe se sirve localmente.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { launchBrowser } from './edge-driver.mjs'
import { createProcessRegistry, getFreePort, isPortFree, poll, runSteps, sleep } from './lib.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const arg = (name) => {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}
const FACE = arg('--face')
const CROP = arg('--crop')?.split(',').map(Number)
const OUT = arg('--out')
/** Simula WebGL bloqueado (como tras un reinicio de la GPU): getContext('webgl'|'webgl2') devuelve null. */
const NO_WEBGL = process.argv.includes('--simulate-no-webgl')
/** Fuerza el delegado de CPU (VITE_MEDIAPIPE_DELEGATE=CPU) para validar esa ruta. */
const FORCE_CPU = process.argv.includes('--cpu')
/** Errores de consola que indican un fallo real (los INFO/W de MediaPipe no lo son). */
const isRealError = (line) => /activeTexture|Aborted\(|onerror:|rejection:/.test(line)
const PORTS = { onboardApi: 4201, onboardUi: 5374 }
const API = `http://localhost:${PORTS.onboardApi}/api`
const UI = `http://localhost:${PORTS.onboardUi}`
const CREW_ID = '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d'
const STORAGE_KEY = 'astronaut-wellness.onboard.selectedCrewId'
const BLOCKED = ['*cdn.jsdelivr.net*', '*storage.googleapis.com*', '*unpkg.com*']

const log = (...a) => console.log(...a)
const ok = (label, value) => log(`  ✔ ${label}${value === undefined ? '' : `: ${value}`}`)
const registry = createProcessRegistry({ log })
const tmp = mkdtempSync(path.join(os.tmpdir(), 'aws-camera-'))
const ctx = { browser: null, page: null, report: {} }

/** Convierte la foto en un vídeo Y4M (I420) de 640×480 usando el propio navegador para decodificarla. */
async function makeY4m(imagePath) {
  const browser = await launchBrowser({ port: await getFreePort(), registry })
  try {
    const page = await browser.newPage()
    const mime = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
    const dataUrl = `data:${mime};base64,${readFileSync(imagePath).toString('base64')}`
    const b64 = await page.evaluate(`(async () => {
      const img = new Image(); img.src = ${JSON.stringify(dataUrl)}; await img.decode()
      const W = 640, H = 480
      let [sx, sy, sw, sh] = ${JSON.stringify(CROP ?? null)} ?? (() => {
        const scale = Math.min(img.width / 4, img.height / 3)
        return [(img.width - 4 * scale) / 2, (img.height - 3 * scale) / 2, 4 * scale, 3 * scale]
      })()
      const c = new OffscreenCanvas(W, H); const g = c.getContext('2d')
      g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H)
      const px = g.getImageData(0, 0, W, H).data
      const out = new Uint8Array(W * H * 3 / 2)
      for (let i = 0; i < W * H; i++) out[i] = Math.round(0.299 * px[4*i] + 0.587 * px[4*i+1] + 0.114 * px[4*i+2])
      const u0 = W * H, v0 = u0 + W * H / 4
      for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) {
        let r = 0, gg = 0, b = 0
        for (const [dx, dy] of [[0,0],[1,0],[0,1],[1,1]]) { const p = 4 * ((2*y+dy) * W + 2*x+dx); r += px[p]; gg += px[p+1]; b += px[p+2] }
        r /= 4; gg /= 4; b /= 4
        out[u0 + y * W / 2 + x] = Math.max(0, Math.min(255, Math.round(-0.169 * r - 0.331 * gg + 0.5 * b + 128)))
        out[v0 + y * W / 2 + x] = Math.max(0, Math.min(255, Math.round(0.5 * r - 0.419 * gg - 0.081 * b + 128)))
      }
      let s = ''; for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000))
      return btoa(s)
    })()`)
    const frame = Buffer.from(b64, 'base64')
    const file = path.join(tmp, 'face.y4m')
    const header = Buffer.from('YUV4MPEG2 W640 H480 F30:1 Ip A1:1 C420jpeg\n')
    const frames = Array.from({ length: 30 }, () => [Buffer.from('FRAME\n'), frame]).flat()
    writeFileSync(file, Buffer.concat([header, ...frames]))
    return file
  } finally {
    await browser.close()
  }
}

async function shot(name) {
  if (!OUT) return
  mkdirSync(OUT, { recursive: true })
  const file = path.join(OUT, `${name}.png`)
  writeFileSync(file, await ctx.page.screenshot())
  ok('Captura', file)
}

const liveText = () => ctx.page.evaluate(`document.querySelector('[aria-label="Métricas en vivo"]')?.innerText ?? ''`)

const steps = [
  {
    title: 'Prerrequisitos y pila aislada (Onboard API + Onboard)',
    run: async () => {
      for (const port of Object.values(PORTS)) if (!(await isPortFree(port))) throw new Error(`Puerto ocupado: ${port}`)
      if (FACE && !existsSync(FACE)) throw new Error(`No existe ${FACE}`)
      const env = (extra) => ({ ...process.env, NODE_ENV: 'development', ...extra })
      registry.start('onboard-api', process.execPath, ['services/onboard-api/src/server.js'], {
        cwd: ROOT,
        env: env({ PORT: String(PORTS.onboardApi), GROUND_API_URL: 'http://localhost:9', TELEMETRY_INTERVAL_MS: '0' }),
      })
      registry.start('onboard', process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(PORTS.onboardUi), '--strictPort'], {
        cwd: path.join(ROOT, 'apps/onboard'),
        env: env({ ONBOARD_API_URL: `http://localhost:${PORTS.onboardApi}`, ...(FORCE_CPU && { VITE_MEDIAPIPE_DELEGATE: 'CPU' }) }),
      })
      await poll(() => fetch(`${API}/sync/status`).then((r) => r.ok), { timeout: 60_000, label: 'Onboard API' })
      await poll(() => fetch(UI).then((r) => r.ok), { timeout: 60_000, label: 'Onboard' })
      const model = await fetch(`${UI}/mediapipe/models/face_landmarker.task`, { method: 'HEAD' })
      if (!model.ok) throw new Error('Onboard no sirve el modelo localmente. Ejecuta «npm run mediapipe:model» (preparación inicial, requiere red una vez) y repite la prueba.')
      ok('Modelo servido localmente', 'sí (/mediapipe/models/face_landmarker.task)')
    },
  },
  {
    title: 'Navegador real con cámara simulada de Chromium',
    run: async () => {
      const video = FACE ? await makeY4m(FACE) : null
      ok('Fuente de vídeo', video ? `Y4M generado desde ${path.basename(FACE)}` : 'patrón de prueba de Chromium (sin rostro)')
      ctx.browser = await launchBrowser({
        port: await getFreePort(),
        registry,
        commandTimeoutMs: 60_000,
        disableGpu: process.argv.includes('--no-gpu'),
        extraArgs: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', ...(video ? [`--use-file-for-fake-video-capture=${video}`] : [])],
      })
      ctx.page = await ctx.browser.newPage()
      await ctx.page.viewport(1280, 1000)
      await ctx.page.send('Network.enable')
      await ctx.page.send('Network.setBlockedURLs', { urls: BLOCKED })
      // Instrumentación de la prueba: guarda las pistas que entrega getUserMedia para comprobar su liberación.
      await ctx.page.addInitScript(`(() => {
        window.__gumCalls = 0; window.__tracks = []; window.__logs = []
        if (${NO_WEBGL}) for (const C of [HTMLCanvasElement, globalThis.OffscreenCanvas].filter(Boolean)) { const o = C.prototype.getContext; C.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : o.call(this, t, ...a) } }
        for (const level of ['error', 'warn']) { const o = console[level].bind(console); console[level] = (...a) => { window.__logs.push(level + ': ' + a.map(String).join(' ').slice(0, 300)); o(...a) } }
        addEventListener('error', (e) => window.__logs.push('onerror: ' + e.message))
        addEventListener('unhandledrejection', (e) => window.__logs.push('rejection: ' + (e.reason?.message ?? e.reason)))
        const md = navigator.mediaDevices, original = md.getUserMedia.bind(md)
        md.getUserMedia = async (c) => { window.__gumCalls++; const s = await original(c); window.__tracks.push(...s.getTracks()); return s }
      })()`)
      await ctx.page.goto(`${UI}/`)
      await ctx.page.waitForText((t) => t.includes('Tripulante'), { timeout: 60_000, label: 'Onboard cargado' })
      await ctx.page.evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(CREW_ID)})`)
      await ctx.page.goto(`${UI}/camera`)
      await ctx.page.waitForText((t) => t.includes('Activar cámara'), { timeout: 60_000, label: 'pantalla de cámara' })
      const calls = await ctx.page.evaluate('window.__gumCalls')
      if (calls !== 0) throw new Error('Se pidió la cámara antes de pulsar «Activar cámara»')
      ok('Sin acceso a la cámara antes del clic', `getUserMedia llamado ${calls} veces`)
    },
  },
  {
    title: 'Consentimiento de envío, ventana de 15 s y activación',
    run: async () => {
      await ctx.page.evaluate(`(() => {
        const sel = document.querySelector('#camera-window')
        const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
        set.call(sel, '15'); sel.dispatchEvent(new Event('change', { bubbles: true }))
      })()`)
      await ctx.page.click('label', 'Enviar métricas agregadas')
      await ctx.page.click('button', 'Activar cámara')
      const { ms } = await ctx.page.waitForText((t) => t.includes('Analizando en este dispositivo') || t.includes('No se pudo iniciar el análisis'), {
        timeout: 90_000,
        label: 'permiso + descarga e inicialización del modelo',
      })
      const text = await ctx.page.text()
      if (text.includes('No se pudo iniciar el análisis')) throw new Error(text.split('No se pudo iniciar el análisis')[1].slice(0, 300))
      ok('Permiso concedido, modelo inicializado y análisis en marcha', `${ms} ms`)
      const resources = await ctx.page.evaluate(`performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /mediapipe|\\.wasm|\\.task/.test(n))`)
      const external = resources.filter((r) => !r.startsWith(UI))
      ok('Recursos de MediaPipe cargados', resources.map((r) => r.replace(UI, '')).join(', '))
      if (external.length) throw new Error(`Se pidieron recursos externos: ${external.join(', ')}`)
      ok('Sin recursos externos: CDN bloqueados y ninguna petición fuera de Onboard')
      if (!(await ctx.page.text()).includes('funciona sin conexión')) throw new Error('La pantalla no indica que el modelo se sirve localmente')
      const tracks = await ctx.page.evaluate(`window.__tracks.map((t) => t.kind + ':' + t.readyState + ':' + t.label)`)
      ok('Pistas de la cámara', tracks.join(', '))
      const delegate = (await ctx.page.text()).match(/Procesamiento: (GPU|CPU)/)?.[1]
      if (!delegate) throw new Error('La pantalla no indica el delegado de procesamiento')
      ok('Delegado de MediaPipe', delegate === 'GPU' ? 'GPU (WebGL)' : 'CPU (la pantalla lo avisa)')
      if (FORCE_CPU && (delegate !== 'CPU' || !(await ctx.page.text()).includes('Procesando con CPU'))) throw new Error('No se informó del procesamiento con CPU')
    },
  },
  {
    title: 'Detección, landmarks y métricas en vivo',
    run: async () => {
      await poll(async () => (await liveText()).includes('Rostro ahora'), { timeout: 20_000, label: 'métricas en vivo' })
      await sleep(2000)
      const live = (await liveText()).replace(/\n/g, ' · ')
      ok('Métricas en vivo', live)
      const painted = await ctx.page.evaluate(`(() => {
        const c = document.querySelector('canvas'); if (!c || !c.width) return 0
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
        return n
      })()`)
      ok('Píxeles de landmarks dibujados sobre el vídeo', painted)
      ctx.report.faceDetected = /Rostro ahora\s*·?\s*Detectado/.test(live)
      ctx.report.landmarksDrawn = painted > 0
      if (FACE && !ctx.report.faceDetected) throw new Error('Con la foto de un rostro, el modelo no detectó ninguna cara')
      if (FACE && !ctx.report.landmarksDrawn) throw new Error('No se dibujaron landmarks')
      if (!FACE && ctx.report.faceDetected) throw new Error('El patrón de prueba no contiene ningún rostro, pero se detectó uno')
      await shot('camera-running')
    },
  },
  {
    title: 'Ventana de 15 s enviada con consentimiento (métricas agregadas reales)',
    run: async () => {
      const { ms } = await ctx.page.waitForText((t) => t.includes('Ventanas enviadas en esta sesión') && t.includes('HTTP 201'), {
        timeout: 30_000,
        label: 'primera ventana enviada',
      })
      const stored = (await (await fetch(`${API}/camera-metrics?crewMemberId=${CREW_ID}&limit=5`)).json()).data[0]
      if (!stored) throw new Error('Onboard API no tiene la ventana')
      const summary = { ...stored }
      delete summary.id
      delete summary.crewMemberId
      ok(`Guardada en Onboard API (${ms} ms)`, JSON.stringify(summary))
      ctx.report.window = summary
    },
  },
  {
    title: 'Detener cámara y comprobar la liberación',
    run: async () => {
      await ctx.page.click('button', 'Detener cámara')
      await ctx.page.waitForText((t) => t.includes('Cámara detenida y liberada'), { label: 'estado detenido' })
      await sleep(300)
      const state = await ctx.page.evaluate(`({
        tracks: window.__tracks.map((t) => t.readyState),
        srcObject: document.querySelector('video')?.srcObject ?? null,
      })`)
      if (state.tracks.some((t) => t !== 'ended')) throw new Error(`Pistas sin liberar: ${state.tracks}`)
      if (state.srcObject !== null) throw new Error('El vídeo conserva el flujo')
      ok('Pistas finalizadas', state.tracks.join(', '))
      ok('Vídeo sin flujo (srcObject = null)')
      await shot('camera-stopped')
    },
  },
  {
    title: 'Ciclos de inicio y parada: 10 completos y 5 parando durante la carga',
    run: async () => {
      await ctx.page.click('nav a', 'Cámara')
      await ctx.page.waitForText((t) => t.includes('Activar cámara'), { timeout: 20_000, label: 'pantalla de cámara' })
      const before = await ctx.page.evaluate('window.__tracks.length')
      for (let i = 1; i <= 10; i++) {
        await ctx.page.click('button', 'Activar cámara')
        await ctx.page.waitForText((t) => t.includes('Analizando en este dispositivo') || t.includes('No se pudo iniciar'), { timeout: 60_000, label: `ciclo ${i}` })
        if ((await ctx.page.text()).includes('No se pudo iniciar')) throw new Error(`Ciclo ${i}: ${(await ctx.page.text()).split('No se pudo iniciar el análisis')[1]?.slice(0, 200)}`)
        await ctx.page.click('button', 'Detener cámara')
        await ctx.page.waitForText((t) => t.includes('Cámara detenida y liberada'), { label: `parada ${i}` })
      }
      ok('10 ciclos completos', 'activar → analizando → detener')
      for (let i = 1; i <= 5; i++) {
        await ctx.page.click('button', 'Activar cámara')
        await ctx.page.click('button', 'Detener cámara') // sin esperar a que cargue el modelo
        await ctx.page.waitForText((t) => t.includes('Cámara detenida y liberada'), { label: `parada inmediata ${i}` })
      }
      ok('5 paradas inmediatas durante la carga')
      await sleep(1500) // los modelos que estaban cargando terminan y deben cerrarse sin efectos
      await ctx.page.click('button', 'Activar cámara')
      await ctx.page.waitForText((t) => t.includes('Analizando en este dispositivo'), { timeout: 60_000, label: 'activación final' })
      await poll(async () => (await liveText()).includes('Rostro ahora'), { timeout: 20_000, label: 'métricas tras los ciclos' })
      await sleep(1500)
      const live = (await liveText()).replace(/\n/g, ' · ')
      if (FACE && !/Rostro ahora\s*·?\s*Detectado/.test(live)) throw new Error(`Tras los ciclos no se detecta el rostro: ${live}`)
      ok('Tras los ciclos sigue detectando', live.split(' · ').slice(0, 2).join(' · '))
      await ctx.page.click('button', 'Detener cámara')
      await ctx.page.waitForText((t) => t.includes('Cámara detenida y liberada'), { label: 'parada final' })
      await sleep(300)
      const state = await ctx.page.evaluate(`({ tracks: window.__tracks.slice(${before}).map((t) => t.readyState), logs: window.__logs })`)
      if (state.tracks.some((t) => t !== 'ended')) throw new Error(`Pistas sin liberar: ${state.tracks.filter((t) => t !== 'ended').length}`)
      ok('Pistas de todos los ciclos finalizadas', `${state.tracks.length} pistas, todas «ended»`)
      const bad = state.logs.filter(isRealError)
      if (bad.length) throw new Error(`Errores en consola: ${bad.slice(0, 3).join(' | ')}`)
      ok('Consola sin errores («activeTexture», Aborted, excepciones)')
    },
  },
  {
    title: 'Reactivar y salir de la pantalla (liberación al desmontar)',
    run: async () => {
      const before = await ctx.page.evaluate('window.__tracks.length')
      await ctx.page.click('button', 'Activar cámara')
      await ctx.page.waitForText((t) => t.includes('Analizando en este dispositivo'), { timeout: 60_000, label: 'reactivación' })
      await ctx.page.click('nav a', 'Inicio')
      await ctx.page.waitForText((t) => !t.includes('Análisis facial ·'), { timeout: 10_000, label: 'pantalla de cámara desmontada' })
      const tracksNow = () => ctx.page.evaluate(`window.__tracks.slice(${before}).map((t) => t.readyState)`)
      const released = await poll(async () => {
        const t = await tracksNow()
        return t.length > 0 && t.every((s) => s === 'ended')
      }, { timeout: 5000, label: 'liberación de las pistas al desmontar' }).catch(() => null)
      const tracks = await tracksNow()
      if (!released) throw new Error(`Pistas sin liberar al salir: ${tracks}`)
      ok('Al salir de la pantalla las pistas quedan', tracks.join(', '))
    },
  },
]

/** Modo --simulate-no-webgl: el fallo original debe convertirse en un error claro y sin fugas. */
const noWebglSteps = [
  ...steps.slice(0, 2),
  {
    title: 'WebGL bloqueado: error explicativo, sin «activeTexture» y cámara liberada',
    run: async () => {
      await ctx.page.click('button', 'Activar cámara')
      await ctx.page.waitForText((t) => t.includes('No se pudo iniciar el análisis'), { timeout: 60_000, label: 'error mostrado' })
      const text = await ctx.page.text()
      if (!text.includes('WebGL no está disponible')) throw new Error('El mensaje no explica que falta WebGL')
      if (/activeTexture/.test(text)) throw new Error('Se sigue mostrando el error «activeTexture»')
      ok('Mensaje', text.split('No se pudo iniciar el análisis')[1].trim().split('\n')[0].slice(0, 160) + '…')
      await sleep(300)
      const state = await ctx.page.evaluate('({ tracks: window.__tracks.map((t) => t.readyState), logs: window.__logs })')
      if (state.tracks.some((t) => t !== 'ended')) throw new Error(`Pistas sin liberar: ${state.tracks}`)
      const bad = state.logs.filter(isRealError)
      if (bad.length) throw new Error(`Errores en consola: ${bad.join(' | ')}`)
      ok('Cámara liberada y consola sin errores', state.tracks.join(', ') || 'sin pistas')
    },
  },
]

let exitCode = 0
try {
  log(`Validación de MediaPipe en navegador real · cámara simulada de Chromium${FACE ? ` con «${path.basename(FACE)}»` : ''}${NO_WEBGL ? ' · WebGL bloqueado (simulado)' : ''}`)
  await runSteps(NO_WEBGL ? noWebglSteps : steps, ctx, log)
  log('\n✔ Validación completada.')
} catch (error) {
  exitCode = 1
  log(`\n✘ ${error.message}`)
} finally {
  try {
    await ctx.browser?.close()
  } catch {
    /* el registro detiene el proceso */
  }
  await registry.stopAll()
  rmSync(tmp, { recursive: true, force: true })
}
process.exit(exitCode)
