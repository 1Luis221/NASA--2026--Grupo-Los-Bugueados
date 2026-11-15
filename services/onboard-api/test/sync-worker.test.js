import { describe, expect, it, vi } from 'vitest'
import { GroundClientError } from '../src/sync/ground-client.js'
import { createTestContext, networkError } from './helpers.js'

const SEEDED_CREW_EVENTS = 3

describe('despachador de sincronización', () => {
  it('envía los pendientes y procesa SyncAck accepted', async () => {
    const { ctx, ground } = createTestContext()
    const summary = await ctx.worker.flush()

    expect(summary).toMatchObject({ sent: SEEDED_CREW_EVENTS, accepted: SEEDED_CREW_EVENTS })
    expect(ctx.queue.stats().byStatus.acknowledged).toBe(SEEDED_CREW_EVENTS)
    expect(ground.received.map((e) => e.sequence)).toEqual([0, 1, 2])
    // Lo que viaja ya está en estado sending, con su intento contabilizado.
    expect(ground.received[0]).toMatchObject({ status: 'sending', attempts: 1 })
  })

  it('desconectado: no intenta enviar y los eventos permanecen en la cola', async () => {
    const { ctx, ground } = createTestContext()
    ctx.link.setState('disconnected')
    ctx.services.telemetryService.tick()

    const summary = await ctx.worker.flush()

    expect(summary.skipped).toBe(true)
    expect(ground.sendEvent).not.toHaveBeenCalled()
    // 3 tripulantes + 1 alerta de enlace + 3 lecturas
    expect(ctx.queue.stats().byStatus).toMatchObject({ pending: 7, acknowledged: 0 })
  })

  it('al reconectar reenvía automáticamente los pendientes, sin duplicados', async () => {
    const { ctx, ground } = createTestContext()
    ctx.link.setState('disconnected')
    ctx.services.telemetryService.tick()

    ctx.link.setState('connected') // dispara el reenvío
    await ctx.worker.flush() // espera al envío en curso

    const ids = ground.received.map((e) => e.id)
    expect(ctx.queue.stats().byStatus).toMatchObject({ pending: 0, acknowledged: 8 })
    expect(new Set(ids).size).toBe(ids.length)
    expect(ground.received.at(-1)).toMatchObject({ entityType: 'alert', operation: 'update' })
  })

  it('un fallo transitorio programa un reintento con backoff y conserva UUID y secuencia', async () => {
    const { ctx, clock, ground } = createTestContext()
    ctx.link.injectFailures(1)

    const first = await ctx.worker.flush()
    const head = ctx.queue.list()[0]
    expect(first).toMatchObject({ sent: 1, retry: 1 })
    expect(head).toMatchObject({ status: 'retry_scheduled', attempts: 1, lastError: { code: 'TRANSIENT_FAILURE' } })
    expect(Date.parse(head.nextRetryAt) - clock.now().getTime()).toBe(1000)

    expect((await ctx.worker.flush()).sent).toBe(0) // aún no vence el backoff

    clock.advance(1000)
    await ctx.worker.flush()
    const retried = ctx.queue.get(head.id)
    expect(retried).toMatchObject({ id: head.id, sequence: head.sequence, status: 'acknowledged', attempts: 2 })
    expect(ground.received.filter((e) => e.id === head.id)).toHaveLength(1)
  })

  it('si se pierde el acuse, el reintento usa el mismo UUID y tierra responde duplicate', async () => {
    const { ctx, clock, ground } = createTestContext()
    ground.loseNextAck(networkError('TIMEOUT'))

    await ctx.worker.flush()
    clock.advance(1000)
    await ctx.worker.flush()

    const [firstSent, resent] = ground.received
    expect(resent.id).toBe(firstSent.id)
    expect(resent.sequence).toBe(firstSent.sequence)
    await expect(ground.sendEvent.mock.results[1].value).resolves.toMatchObject({ result: 'duplicate' })
    expect(ground.stored.size).toBe(SEEDED_CREW_EVENTS) // ningún registro duplicado
    expect(ctx.queue.get(firstSent.id).status).toBe('acknowledged')
  })

  it('marca failed al agotar los reintentos', async () => {
    const { ctx, clock } = createTestContext()
    ctx.link.injectFailures(3)
    for (let i = 0; i < 3; i++) {
      await ctx.worker.flush()
      clock.advance(10_000)
    }
    expect(ctx.queue.list()[0]).toMatchObject({ status: 'failed', attempts: 3, lastError: { code: 'TRANSIENT_FAILURE' } })
  })

  it('un SyncAck rejected marca el evento como failed sin reintentar', async () => {
    const { ctx, clock, ground } = createTestContext()
    ground.rejectNext()
    await ctx.worker.flush()
    clock.advance(60_000)
    await ctx.worker.flush()

    const head = ctx.queue.list()[0]
    expect(head).toMatchObject({ status: 'failed', attempts: 1, lastError: { code: 'INVALID_EVENT' } })
    expect(ground.received.filter((e) => e.id === head.id)).toHaveLength(1)
  })

  it('un SyncAck que no corresponde al evento se trata como fallo recuperable', async () => {
    const { ctx, ground } = createTestContext()
    ground.mismatchNext()
    await ctx.worker.flush()
    expect(ctx.queue.list()[0]).toMatchObject({ status: 'retry_scheduled', lastError: { code: 'ACK_MISMATCH' } })
  })

  it('un error no recuperable del cliente marca failed', async () => {
    const { ctx, ground } = createTestContext()
    ground.failNext(new GroundClientError('HTTP_400', 'Bad Request', { retryable: false }))
    await ctx.worker.flush()
    expect(ctx.queue.list()[0]).toMatchObject({ status: 'failed', lastError: { code: 'HTTP_400' } })
  })

  it('enlace degradado: las pérdidas se reintentan hasta entregarse', async () => {
    const { ctx, clock } = createTestContext()
    ctx.link.configure({ degradedFailureRate: 0.5 })
    ctx.link.setState('degraded')
    for (let i = 0; i < 20 && ctx.queue.stats().byStatus.acknowledged < SEEDED_CREW_EVENTS; i++) {
      await ctx.worker.flush()
      clock.advance(4000)
    }
    expect(ctx.queue.stats().byStatus.acknowledged).toBe(SEEDED_CREW_EVENTS)
  })

  it('flush concurrente reutiliza el envío en curso', async () => {
    const { ctx, ground } = createTestContext()
    const [a, b] = [ctx.worker.flush(), ctx.worker.flush()]
    expect(a).toBe(b)
    await a
    expect(ground.sendEvent).toHaveBeenCalledTimes(SEEDED_CREW_EVENTS)
  })
})

describe('ciclo de vida y limpieza de recursos', () => {
  it('start() crea los temporizadores y stop() los elimina todos', async () => {
    vi.useFakeTimers()
    try {
      const { ctx } = createTestContext({ env: { TELEMETRY_INTERVAL_MS: '5000', SYNC_INTERVAL_MS: '1000' } })
      ctx.start()
      ctx.start() // idempotente
      expect(vi.getTimerCount()).toBe(3) // telemetría, despachador y comprobación de datos desactualizados
      expect(ctx.worker.isRunning()).toBe(true)

      await vi.advanceTimersByTimeAsync(5000)
      expect(ctx.stores.vitals.size()).toBe(3)

      await ctx.stop()
      expect(vi.getTimerCount()).toBe(0)
      expect(ctx.worker.isRunning()).toBe(false)
      expect(ctx.services.telemetryService.isRunning()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('stop() desuscribe los listeners del enlace', async () => {
    const { ctx } = createTestContext()
    await ctx.stop()
    ctx.link.setState('disconnected')
    expect(ctx.stores.alerts.size()).toBe(0)
  })
})
