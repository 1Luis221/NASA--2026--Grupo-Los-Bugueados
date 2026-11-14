/** Dependencias de tiempo y registro, inyectables para pruebas deterministas. */

export const systemClock = Object.freeze({ now: () => new Date() })

export function createLogger(name) {
  const prefix = `[${name}]`
  return {
    info: (...args) => console.log(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  }
}

export const silentLogger = Object.freeze({ info() {}, warn() {}, error() {} })

/** Recorta `text` a `max` caracteres (los contratos limitan longitudes). */
export const truncate = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)
