import { vi } from 'vitest'
import { loadConfig } from '../src/config.js'
import { createOnboardContext } from '../src/context.js'
import { silentLogger } from '../src/lib/runtime.js'

export const START = '2026-11-14T10:00:00.000Z'

/** Reloj manual: el tiempo solo avanza cuando la prueba lo indica. */
export function createManualClock(start = START) {
  let t = Date.parse(start)
  return {
    now: () => new Date(t),
    advance(ms) {
      t += ms
    },
  }
}

/** Configuración de pruebas: sin temporizadores automáticos ni latencia real. */
export function testConfig(env = {}) {
  return loadConfig({
    NODE_ENV: 'test',
    TELEMETRY_INTERVAL_MS: '0',
    SYNC_INTERVAL_MS: '0',
    SYNC_MAX_ATTEMPTS: '3',
    SYNC_BACKOFF_BASE_MS: '1000',
    SYNC_BACKOFF_MAX_MS: '4000',
    LINK_LATENCY_MS: '0',
    LINK_DEGRADED_LATENCY_MS: '0',
    GROUND_API_URL: 'http://127.0.0.1:9',
    ...env,
  })
}

/**
 * Tierra simulada en memoria con semántica idempotente: guarda cada `id`
 * una sola vez y responde `duplicate` si se repite. `failNext(err)` hace que
 * la siguiente llamada falle ANTES de procesar; `loseNextAck(err)` procesa el
 * evento pero simula que el acuse se pierde por el camino.
 */
export function createFakeGround(clock) {
  const received = []
  const stored = new Map()
  const plan = []

  const sendEvent = vi.fn(async (event) => {
    received.push(event)
    const step = plan.shift()
    if (step?.type === 'fail') throw step.error
    const result = step?.type === 'reject' ? 'rejected' : stored.has(event.id) ? 'duplicate' : 'accepted'
    if (result === 'accepted') stored.set(event.id, event)
    if (step?.type === 'lose-ack') throw step.error
    return {
      eventId: step?.type === 'mismatch' ? crypto.randomUUID() : event.id,
      sequence: event.sequence,
      origin: 'ground',
      destination: 'onboard',
      result,
      receivedAt: clock.now().toISOString(),
      ...(result === 'rejected' && { error: { code: 'INVALID_EVENT', message: 'rechazado en la prueba' } }),
    }
  })

  return {
    sendEvent,
    received,
    stored,
    /** La siguiente llamada se procesa con normalidad (para colocar fallos en llamadas posteriores). */
    passNext: () => plan.push({ type: 'pass' }),
    failNext: (error) => plan.push({ type: 'fail', error }),
    loseNextAck: (error) => plan.push({ type: 'lose-ack', error }),
    rejectNext: () => plan.push({ type: 'reject' }),
    mismatchNext: () => plan.push({ type: 'mismatch' }),
  }
}

export function networkError(code = 'NETWORK_ERROR') {
  return Object.assign(new Error(`fallo simulado ${code}`), { code, retryable: true })
}

/** Contexto de la nave aislado para cada prueba. */
export function createTestContext({ env, clock = createManualClock(), groundClient, sleep } = {}) {
  const ground = groundClient ?? createFakeGround(clock)
  const ctx = createOnboardContext({
    config: testConfig(env),
    clock,
    logger: silentLogger,
    groundClient: ground,
    ...(sleep && { sleep }),
  })
  return { ctx, clock, ground }
}
