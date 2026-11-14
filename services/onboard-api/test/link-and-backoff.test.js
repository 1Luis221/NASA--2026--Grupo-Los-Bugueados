import { describe, expect, it, vi } from 'vitest'
import { createLinkSimulator, LinkError } from '../src/link/link-simulator.js'
import { createRandom, silentLogger } from '../src/lib/runtime.js'
import { computeBackoffMs } from '../src/sync/backoff.js'
import { createManualClock } from './helpers.js'

function createLink(options = {}) {
  const sleep = vi.fn(async () => {})
  const link = createLinkSimulator({ clock: createManualClock(), logger: silentLogger, sleep, rng: createRandom(1), ...options })
  return { link, sleep }
}

describe('computeBackoffMs', () => {
  const options = { baseMs: 1000, maxMs: 30_000 }

  it('crece exponencialmente y respeta el máximo', () => {
    expect([1, 2, 3, 4, 5, 6, 10].map((n) => computeBackoffMs(n, options))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ])
  })

  it('no espera antes del primer intento', () => {
    expect(computeBackoffMs(0, options)).toBe(0)
  })
})

describe('createLinkSimulator', () => {
  it('transmite en estado connected', async () => {
    const { link } = createLink()
    await expect(link.transmit(async () => 'ack')).resolves.toBe('ack')
  })

  it('falla con LINK_DOWN cuando está desconectado y no llama al envío', async () => {
    const { link } = createLink({ initialState: 'disconnected' })
    const send = vi.fn()
    await expect(link.transmit(send)).rejects.toMatchObject({ name: 'LinkError', code: 'LINK_DOWN', retryable: true })
    expect(send).not.toHaveBeenCalled()
  })

  it('inyecta fallos transitorios contados', async () => {
    const { link } = createLink()
    link.injectFailures(2)
    await expect(link.transmit(async () => 'ok')).rejects.toBeInstanceOf(LinkError)
    await expect(link.transmit(async () => 'ok')).rejects.toMatchObject({ code: 'TRANSIENT_FAILURE' })
    await expect(link.transmit(async () => 'ok')).resolves.toBe('ok')
  })

  it('en modo degradado pierde transmisiones según la tasa configurada', async () => {
    const { link } = createLink({ initialState: 'degraded', degradedFailureRate: 1 })
    await expect(link.transmit(async () => 'ok')).rejects.toMatchObject({ code: 'LINK_DEGRADED_LOSS' })
    link.configure({ degradedFailureRate: 0 })
    await expect(link.transmit(async () => 'ok')).resolves.toBe('ok')
  })

  it('es determinista con la misma semilla', async () => {
    const outcomes = async () => {
      const { link } = createLink({ initialState: 'degraded', degradedFailureRate: 0.5, rng: createRandom(7) })
      const results = []
      for (let i = 0; i < 20; i++) results.push(await link.transmit(async () => 'ok').catch((e) => e.code))
      return results
    }
    const first = await outcomes()
    expect(await outcomes()).toEqual(first)
    expect(first).toContain('ok')
    expect(first).toContain('LINK_DEGRADED_LOSS')
  })

  it('aplica latencia artificial (más en modo degradado) mediante sleep inyectado', async () => {
    const { link, sleep } = createLink({ latencyMs: 200, degradedLatencyMs: 800 })
    await link.transmit(async () => 'ok')
    link.setState('degraded')
    await link.transmit(async () => 'ok')
    expect(sleep.mock.calls).toEqual([[200], [1000]])
  })

  it('sin latencia no crea esperas', async () => {
    const { link, sleep } = createLink()
    await link.transmit(async () => 'ok')
    expect(sleep).not.toHaveBeenCalled()
  })

  it('notifica los cambios de estado y permite desuscribirse', () => {
    const { link } = createLink()
    const listener = vi.fn()
    const unsubscribe = link.onChange(listener)
    link.setState('degraded')
    link.setState('degraded') // sin cambio: no notifica
    unsubscribe()
    link.setState('disconnected')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ previous: 'connected', current: 'degraded' })
  })

  it('rechaza estados desconocidos', () => {
    const { link } = createLink()
    expect(() => link.setState('offline')).toThrow(RangeError)
    expect(() => createLink({ initialState: 'offline' })).toThrow(RangeError)
  })
})
