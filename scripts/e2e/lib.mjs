/**
 * Utilidades del script E2E (sin dependencias). Puras o con efectos acotados,
 * para poder probarlas de forma aislada (lib.test.mjs).
 */
import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Rechaza si `promise` no termina en `ms`. Limpia su temporizador en cualquier caso. */
export async function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Tiempo agotado (${ms} ms): ${label}`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Repite `check()` hasta que devuelva un valor verdadero o se agote `timeout`.
 * Devuelve { value, ms }. Nunca espera indefinidamente.
 */
export async function poll(check, { timeout = 20_000, interval = 250, label = 'condición' } = {}) {
  const start = Date.now()
  let lastError
  while (Date.now() - start < timeout) {
    try {
      const value = await check()
      if (value) return { value, ms: Date.now() - start }
    } catch (error) {
      lastError = error
    }
    await sleep(interval)
  }
  throw new Error(`Tiempo agotado (${timeout} ms) esperando: ${label}${lastError ? ` · último error: ${lastError.message}` : ''}`)
}

/** Error de un paso concreto del flujo: conserva número, nombre y causa. */
export class StepError extends Error {
  constructor(number, title, cause) {
    super(`Paso ${number} «${title}» falló: ${cause?.message ?? cause}`, { cause })
    this.name = 'StepError'
    this.step = number
    this.title = title
  }
}

/**
 * Ejecuta pasos en orden: [{ title, run(ctx) }]. Se detiene en el primero que
 * falla y lanza StepError. `log` recibe los mensajes de progreso.
 */
export async function runSteps(steps, ctx, log = console.log) {
  const results = []
  for (const [i, { title, run }] of steps.entries()) {
    const number = i + 1
    log(`\n${number} · ${title}`)
    try {
      results.push(await run(ctx))
    } catch (error) {
      throw new StepError(number, title, error)
    }
  }
  return results
}

/** ¿Está libre el puerto TCP en IPv4 e IPv6 locales? (Vite escucha en ::1). */
export async function isPortFree(port) {
  const tryListen = (host) =>
    new Promise((resolve) => {
      const server = net.createServer()
      server.once('error', (error) => resolve(error.code === 'EADDRNOTAVAIL' || error.code === 'EAFNOSUPPORT'))
      server.listen({ port, host, exclusive: true }, () => server.close(() => resolve(true)))
    })
  return (await tryListen('127.0.0.1')) && (await tryListen('::1'))
}

/** Un puerto libre que asigna el sistema (para DevTools del navegador). */
export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen({ port: 0, host: '127.0.0.1' }, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

/**
 * Registro de los procesos que lanza el propio script. Solo detiene esos PID
 * (y su árbol en Windows): nunca procesos ajenos.
 */
export function createProcessRegistry({ log = () => {} } = {}) {
  const children = new Set()

  function start(name, command, args, options = {}) {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true, ...options })
    child.name = name
    children.add(child)
    child.once('exit', () => children.delete(child))
    log(`  [${name}] pid ${child.pid}`)
    return child
  }

  async function stop(child, { graceMs = 3000 } = {}) {
    if (child.exitCode !== null || child.signalCode !== null) return
    const exited = new Promise((resolve) => child.once('exit', resolve))
    child.kill()
    const done = await Promise.race([exited.then(() => true), sleep(graceMs).then(() => false)])
    if (!done && process.platform === 'win32') {
      // Solo el árbol del PID que lanzamos nosotros.
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    } else if (!done) {
      child.kill('SIGKILL')
    }
  }

  return {
    start,
    stop,
    /** Detiene todos los procesos lanzados (en orden inverso). Nunca lanza. */
    async stopAll() {
      for (const child of [...children].reverse()) {
        try {
          await stop(child)
        } catch {
          /* se intenta con el resto */
        }
      }
    },
    size: () => children.size,
  }
}
