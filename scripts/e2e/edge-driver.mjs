/**
 * Control mínimo de Microsoft Edge / Google Chrome en modo headless mediante
 * Chrome DevTools Protocol (WebSocket nativo de Node ≥ 22). Sin dependencias.
 *
 * - Perfil temporal propio (se borra al cerrar).
 * - Cada orden CDP tiene tiempo máximo.
 * - Al cerrar: Browser.close y, si el proceso sigue vivo, se detiene SOLO su árbol.
 */
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { poll, sleep, withTimeout } from './lib.mjs'

const CANDIDATES = [
  process.env.E2E_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

/** Ruta del navegador compatible con CDP, o null. Se puede forzar con E2E_BROWSER. */
export const findBrowser = () => CANDIDATES.find((candidate) => existsSync(candidate)) ?? null

const KEYS = {
  Enter: { code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40 },
  Escape: { code: 'Escape', windowsVirtualKeyCode: 27 },
}

async function connectPage(wsUrl, commandTimeoutMs) {
  const ws = new WebSocket(wsUrl)
  await withTimeout(
    new Promise((resolve, reject) => {
      ws.onopen = resolve
      ws.onerror = () => reject(new Error('No se pudo abrir el WebSocket de DevTools'))
    }),
    10_000,
    'conexión CDP',
  )
  let nextId = 1
  const pending = new Map()
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data)
    const entry = data.id && pending.get(data.id)
    if (!entry) return
    pending.delete(data.id)
    data.error ? entry.reject(new Error(data.error.message)) : entry.resolve(data.result)
  }
  const send = (method, params = {}) =>
    withTimeout(
      new Promise((resolve, reject) => {
        const id = nextId++
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      }),
      commandTimeoutMs,
      `CDP ${method}`,
    )
  await send('Page.enable')
  await send('Runtime.enable')

  const page = {
    send,
    viewport: (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }),
    goto: (url) => send('Page.navigate', { url }),
    async evaluate(expression) {
      const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
      return result.value
    },
    text: () => page.evaluate('document.body ? document.body.innerText : ""'),
    /** Espera a que el texto visible cumpla `predicate`. */
    waitForText: (predicate, { timeout = 20_000, label }) => poll(async () => predicate(await page.text()), { timeout, label }),
    /** Clic DOM en el primer elemento del selector cuyo texto empiece por `text`. */
    async click(selector, text) {
      const found = await page.evaluate(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
          .find((e) => ${text ? `e.textContent.trim().startsWith(${JSON.stringify(text)})` : 'true'})
        if (!el) return false
        el.click()
        return true
      })()`)
      if (!found) throw new Error(`No se encontró «${selector}»${text ? ` con el texto «${text}»` : ''}`)
    },
    async focus(selector) {
      if (!(await page.evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el?.focus(); return !!el })()`))) {
        throw new Error(`No se encontró «${selector}»`)
      }
    },
    async key(name) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, ...KEYS[name] })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, ...KEYS[name] })
      await sleep(120)
    },
    type: (text) => send('Input.insertText', { text }),
    close: () => ws.close(),
  }
  return page
}

/**
 * Lanza el navegador headless. `registry` (createProcessRegistry) permite que
 * la limpieza general también lo detenga si algo falla.
 */
export async function launchBrowser({ executable = findBrowser(), port = 9333, registry, commandTimeoutMs = 15_000 } = {}) {
  if (!executable) throw new Error('No se encontró Microsoft Edge ni Google Chrome (define E2E_BROWSER)')
  const profileDir = mkdtempSync(path.join(os.tmpdir(), 'aws-e2e-profile-'))
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-extensions',
    '--force-prefers-reduced-motion',
    'about:blank',
  ]
  const proc = registry.start('navegador', executable, args)

  await poll(() => fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok), { timeout: 15_000, label: 'DevTools del navegador' })

  const pages = []
  const newPage = async () => {
    const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json())
    const page = await connectPage(target.webSocketDebuggerUrl, commandTimeoutMs)
    pages.push(page)
    return page
  }

  async function close() {
    try {
      await withTimeout(pages[0]?.send('Browser.close') ?? Promise.resolve(), 5000, 'Browser.close')
    } catch {
      /* se detiene el proceso a continuación */
    }
    pages.forEach((page) => page.close())
    await registry.stop(proc)
    // El navegador puede tardar en liberar el perfil: varios intentos, sin fallar.
    for (let i = 0; i < 5; i++) {
      try {
        rmSync(profileDir, { recursive: true, force: true })
        break
      } catch {
        await sleep(400)
      }
    }
  }

  return { newPage, close }
}
