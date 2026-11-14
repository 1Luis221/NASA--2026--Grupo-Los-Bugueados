import { describe, expect, it } from 'vitest'
import { exampleAlert, exampleSyncAck, exampleSyncEvent } from '../src/examples.js'
import { SYNC_STATUSES } from '../src/schemas/enums.js'
import { SyncAckSchema, SyncEventSchema } from '../src/schemas/sync-event.js'
import { SYNC_STATUS_TRANSITIONS, canTransitionSyncStatus } from '../src/schemas/transitions.js'
import { expectInvalid, expectValid, variant } from './helpers.js'

const pendingEvent = variant(exampleSyncEvent, (e) => {
  e.status = 'pending'
  e.attempts = 0
  delete e.lastAttemptAt
  delete e.nextRetryAt
  delete e.lastError
})

describe('SyncEventSchema', () => {
  it('acepta el ejemplo documentado (reintento tras corte de enlace)', () => {
    expectValid(SyncEventSchema, exampleSyncEvent)
  })

  it('acepta un evento recién encolado', () => {
    expectValid(SyncEventSchema, pendingEvent)
  })

  it('acepta un evento confirmado por el destino', () => {
    expectValid(SyncEventSchema, variant(exampleSyncEvent, (e) => {
      e.status = 'acknowledged'
      e.attempts = 3
      e.acknowledgedAt = '2026-11-14T10:01:31.000Z'
      e.updatedAt = e.acknowledgedAt
      delete e.nextRetryAt
    }))
  })

  it('acepta otro tipo de entidad (alerta desde tierra)', () => {
    expectValid(SyncEventSchema, variant(pendingEvent, (e) => {
      e.origin = 'ground'
      e.destination = 'onboard'
      e.entityType = 'alert'
      e.entityId = exampleAlert.id
      e.operation = 'update'
      e.payload = structuredClone(exampleAlert)
    }))
  })

  it('rechaza origen igual al destino', () => {
    expectInvalid(SyncEventSchema, variant(pendingEvent, (e) => { e.destination = 'onboard' }), ['destination'])
  })

  it('rechaza más intentos que el máximo', () => {
    expectInvalid(SyncEventSchema, variant(pendingEvent, (e) => { e.attempts = 11 }), ['attempts'])
  })

  it('exige nextRetryAt y lastError en reintentos programados', () => {
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { delete e.nextRetryAt }), ['nextRetryAt'])
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { delete e.lastError }), ['lastError'])
  })

  it('rechaza un reintento cuando ya se agotaron los intentos', () => {
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { e.attempts = e.maxAttempts }), ['attempts'])
  })

  it('rechaza nextRetryAt anterior al último intento', () => {
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { e.nextRetryAt = '2026-11-14T10:00:00.000Z' }), ['nextRetryAt'])
  })

  it('exige lastError en eventos fallidos y acknowledgedAt en confirmados', () => {
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => {
      e.status = 'failed'
      delete e.lastError
    }), ['lastError'])
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { e.status = 'acknowledged' }), ['acknowledgedAt'])
  })

  it('exige lastAttemptAt en envíos en curso', () => {
    expectInvalid(SyncEventSchema, variant(pendingEvent, (e) => {
      e.status = 'sending'
      e.attempts = 1
    }), ['lastAttemptAt'])
  })

  it('valida el payload contra el esquema de su entidad', () => {
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => {
      e.payload.heartRate = { value: 999, unit: 'bpm' }
    }), ['payload', 'heartRate', 'value'])
  })

  it('rechaza un payload de otro tipo de entidad', () => {
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { e.entityType = 'alert' }), ['payload', 'origin'])
  })

  it('exige que entityId coincida con payload.id', () => {
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { e.entityId = exampleAlert.id }), ['entityId'])
  })
})

describe('contrato de idempotencia', () => {
  it('exige un id (clave de idempotencia)', () => {
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { delete e.id }), ['id'])
  })

  it('exige que el id sea un UUID', () => {
    expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { e.id = 'evt-42' }), ['id'])
  })

  it('exige un sequence entero no negativo', () => {
    for (const sequence of [-1, 1.5, '42', undefined]) {
      expectInvalid(SyncEventSchema, variant(exampleSyncEvent, (e) => { e.sequence = sequence }), ['sequence'])
    }
  })

  it('el id y el sequence se conservan a lo largo del ciclo de reintentos', () => {
    const lifecycle = [
      pendingEvent,
      variant(pendingEvent, (e) => Object.assign(e, { status: 'sending', attempts: 1, lastAttemptAt: '2026-11-14T10:00:02.000Z', updatedAt: '2026-11-14T10:00:02.000Z' })),
      exampleSyncEvent,
      variant(exampleSyncEvent, (e) => {
        Object.assign(e, { status: 'acknowledged', attempts: 3, acknowledgedAt: '2026-11-14T10:01:31.000Z', updatedAt: '2026-11-14T10:01:31.000Z' })
        delete e.nextRetryAt
      }),
    ]
    for (const step of lifecycle) expectValid(SyncEventSchema, step)
    expect(new Set(lifecycle.map((e) => `${e.id}|${e.origin}|${e.sequence}`)).size).toBe(1)
  })
})

describe('SyncAckSchema', () => {
  it('acepta el ejemplo documentado', () => {
    expectValid(SyncAckSchema, exampleSyncAck)
  })

  it('referencia el evento por su id', () => {
    expect(exampleSyncAck.eventId).toBe(exampleSyncEvent.id)
    expectInvalid(SyncAckSchema, variant(exampleSyncAck, (a) => { a.eventId = 'evt-42' }), ['eventId'])
  })

  it('acepta un duplicado (evento ya procesado) sin error', () => {
    expectValid(SyncAckSchema, variant(exampleSyncAck, (a) => { a.result = 'duplicate' }))
  })

  it('exige error en un rechazo y lo prohíbe en los demás resultados', () => {
    expectInvalid(SyncAckSchema, variant(exampleSyncAck, (a) => { a.result = 'rejected' }), ['error'])
    expectValid(SyncAckSchema, variant(exampleSyncAck, (a) => {
      a.result = 'rejected'
      a.error = { code: 'INVALID_PAYLOAD', message: 'heartRate.value fuera de dominio' }
    }))
    expectInvalid(SyncAckSchema, variant(exampleSyncAck, (a) => {
      a.error = { code: 'X', message: 'no aplica' }
    }), ['error'])
  })

  it('rechaza origen igual al destino y resultados desconocidos', () => {
    expectInvalid(SyncAckSchema, variant(exampleSyncAck, (a) => { a.destination = 'ground' }), ['destination'])
    expectInvalid(SyncAckSchema, variant(exampleSyncAck, (a) => { a.result = 'ok' }), ['result'])
  })
})

describe('transiciones de estado de sincronización', () => {
  it.each([
    ['pending', 'sending', true],
    ['sending', 'acknowledged', true],
    ['sending', 'retry_scheduled', true],
    ['sending', 'failed', true],
    ['retry_scheduled', 'sending', true],
    ['retry_scheduled', 'failed', true],
    ['failed', 'pending', true],
    ['pending', 'acknowledged', false],
    ['acknowledged', 'pending', false],
    ['retry_scheduled', 'acknowledged', false],
  ])('%s → %s = %s', (from, to, allowed) => {
    expect(canTransitionSyncStatus(from, to)).toBe(allowed)
  })

  it('define transiciones para todos los estados', () => {
    expect(Object.keys(SYNC_STATUS_TRANSITIONS).sort()).toEqual([...SYNC_STATUSES].sort())
  })
})
