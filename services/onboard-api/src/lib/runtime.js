/**
 * Dependencias de tiempo, azar y registro. Se inyectan en todos los módulos
 * para que los tests sean deterministas (reloj manual, semilla fija, sin logs).
 */

/** Reloj del sistema. Los tests usan un reloj manual con la misma interfaz. */
export const systemClock = Object.freeze({ now: () => new Date() })

/** Espera no bloqueante. El temporizador termina por sí solo al resolverse. */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Generador pseudoaleatorio determinista (mulberry32) en [0, 1). */
export function createRandom(seed) {
  let state = seed >>> 0
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const generateId = () => crypto.randomUUID()

export function createLogger(name) {
  const prefix = `[${name}]`
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  }
}

export const silentLogger = Object.freeze({ info() {}, warn() {}, error() {} })

/** Copia de `obj` sin las claves indicadas (evita dejar opcionales en `undefined`). */
export function omitKeys(obj, keys) {
  const copy = { ...obj }
  for (const key of keys) delete copy[key]
  return copy
}

/** Recorta `text` a `max` caracteres (los contratos limitan longitudes). */
export const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
