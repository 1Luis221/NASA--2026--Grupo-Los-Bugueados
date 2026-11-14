import { LINK_STATES } from '@astronaut-wellness/shared'

/** Fallo del enlace simulado. Siempre recuperable: el evento se reintentará. */
export class LinkError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'LinkError'
    this.code = code
    this.retryable = true
  }
}

/**
 * Simulador del enlace de comunicaciones nave–Tierra.
 *
 * - connected:    transmite con `latencyMs` de latencia artificial.
 * - degraded:     añade `degradedLatencyMs` y pierde transmisiones con
 *                 probabilidad `degradedFailureRate` (según `rng`, determinista).
 * - disconnected: toda transmisión falla con LINK_DOWN.
 *
 * `injectFailures(n)` fuerza n fallos transitorios consecutivos.
 * No crea temporizadores propios: la latencia se aplica con `sleep` inyectado.
 */
export function createLinkSimulator({
  initialState = 'connected',
  latencyMs = 0,
  degradedLatencyMs = 0,
  degradedFailureRate = 0,
  rng = Math.random,
  sleep,
  clock,
  logger,
}) {
  assertState(initialState)
  let state = initialState
  let changedAt = clock.now().toISOString()
  let pendingFailures = 0
  const settings = { latencyMs, degradedLatencyMs, degradedFailureRate }
  const listeners = new Set()

  function getStatus() {
    return { state, ...settings, pendingFailures, changedAt }
  }

  function setState(next) {
    assertState(next)
    if (next === state) return getStatus()
    const previous = state
    state = next
    changedAt = clock.now().toISOString()
    logger.info(`enlace ${previous} → ${next}`)
    for (const listener of listeners) {
      try {
        listener({ previous, current: next })
      } catch (err) {
        logger.error('error en listener del enlace', err)
      }
    }
    return getStatus()
  }

  function configure(changes) {
    for (const key of Object.keys(settings)) {
      if (changes[key] !== undefined) settings[key] = changes[key]
    }
    return getStatus()
  }

  function injectFailures(count) {
    pendingFailures += count
    return getStatus()
  }

  /** Registra un listener de cambios de estado. Devuelve la función para eliminarlo. */
  function onChange(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  /** Ejecuta `send` a través del enlace simulado o lanza LinkError. */
  async function transmit(send) {
    if (state === 'disconnected') {
      throw new LinkError('LINK_DOWN', 'Enlace nave-Tierra desconectado')
    }
    if (pendingFailures > 0) {
      pendingFailures -= 1
      throw new LinkError('TRANSIENT_FAILURE', 'Fallo transitorio simulado del enlace')
    }
    if (state === 'degraded' && rng() < settings.degradedFailureRate) {
      throw new LinkError('LINK_DEGRADED_LOSS', 'Transmisión perdida por enlace degradado')
    }
    const delay = settings.latencyMs + (state === 'degraded' ? settings.degradedLatencyMs : 0)
    if (delay > 0) await sleep(delay)
    return send()
  }

  return { getStatus, setState, configure, injectFailures, onChange, transmit }
}

function assertState(state) {
  if (!LINK_STATES.includes(state)) {
    throw new RangeError(`Estado de enlace desconocido: ${state}`)
  }
}
