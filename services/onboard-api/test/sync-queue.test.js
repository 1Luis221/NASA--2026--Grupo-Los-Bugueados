import { describe, expect, it } from 'vitest'
import { SyncEventStrictSchema } from '@astronaut-wellness/shared'
import { exampleVitalSigns } from '@astronaut-wellness/shared/examples'
import { createSyncQueue } from '../src/sync/sync-queue.js'
import { createManualClock } from './helpers.js'

function createQueue() {
  const clock = createManualClock()
  const queue = createSyncQueue({
    clock,
    generateId: () => crypto.randomUUID(),
    maxAttempts: 3,
    backoff: { baseMs: 1000, maxMs: 4000 },
  })
  const enqueue = () =>
    queue.enqueue({ entityType: 'vital_signs', operation: 'create', payload: { ...exampleVitalSigns, id: crypto.randomUUID() } })
  return { clock, queue, enqueue }
}

const error = { code: 'LINK_DOWN', message: 'sin enlace' }

describe('cola de sincronización', () => {
  it('crea SyncEvent válidos en modo estricto con UUID y secuencia monótona', () => {
    const { queue, enqueue } = createQueue()
    const events = [enqueue(), enqueue(), enqueue()]

    for (const event of events) {
      expect(SyncEventStrictSchema.safeParse(event).success).toBe(true)
      expect(event).toMatchObject({ origin: 'onboard', destination: 'ground', status: 'pending', attempts: 0 })
    }
    expect(events.map((e) => e.sequence)).toEqual([0, 1, 2])
    expect(new Set(events.map((e) => e.id)).size).toBe(3)
    expect(queue.stats()).toMatchObject({ total: 3, lastSequence: 2, byStatus: { pending: 3 } })
  })

  it('conserva id y sequence en todo el ciclo de reintentos', () => {
    const { clock, queue, enqueue } = createQueue()
    const { id, sequence } = enqueue()

    queue.markSending(id)
    const retry = queue.markRetry(id, error)
    clock.advance(1000)
    queue.markSending(id)
    const done = queue.markAcknowledged(id)

    expect(retry).toMatchObject({ id, sequence, status: 'retry_scheduled', attempts: 1, lastError: error })
    expect(done).toMatchObject({ id, sequence, status: 'acknowledged', attempts: 2 })
    expect(done).not.toHaveProperty('nextRetryAt')
  })

  it('programa reintentos con backoff exponencial limitado', () => {
    const { clock, queue, enqueue } = createQueue()
    const { id } = enqueue()
    const delays = []
    for (let i = 0; i < 2; i++) {
      queue.markSending(id)
      const event = queue.markRetry(id, error)
      delays.push(Date.parse(event.nextRetryAt) - clock.now().getTime())
      clock.advance(10_000)
    }
    expect(delays).toEqual([1000, 2000])
  })

  it('marca failed al agotar maxAttempts', () => {
    const { queue, enqueue } = createQueue()
    const { id } = enqueue()
    for (let i = 0; i < 3; i++) {
      queue.markSending(id)
      queue.markRetry(id, error)
    }
    expect(queue.get(id)).toMatchObject({ status: 'failed', attempts: 3, lastError: error })
  })

  it('listDue entrega en orden FIFO y bloquea tras un reintento no vencido', () => {
    const { clock, queue, enqueue } = createQueue()
    const [first, second] = [enqueue(), enqueue()]
    expect(queue.listDue().map((e) => e.id)).toEqual([first.id, second.id])

    queue.markSending(first.id)
    queue.markRetry(first.id, error)
    expect(queue.listDue()).toEqual([])

    clock.advance(1000)
    expect(queue.listDue().map((e) => e.id)).toEqual([first.id, second.id])
  })

  it('rechaza transiciones no permitidas', () => {
    const { queue, enqueue } = createQueue()
    const { id } = enqueue()
    expect(() => queue.markAcknowledged(id)).toThrow(/no permitida/)
    expect(() => queue.markSending('no-existe')).toThrow(/desconocido/)
  })

  it('permite reencolar manualmente un evento fallido conservando id y sequence', () => {
    const { queue, enqueue } = createQueue()
    const { id, sequence } = enqueue()
    queue.markSending(id)
    queue.markFailed(id, error)
    expect(queue.requeue(id)).toMatchObject({ id, sequence, status: 'pending', attempts: 0 })
  })
})
