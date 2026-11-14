import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { SyncAckStrictSchema } from '@astronaut-wellness/shared'
import { createApp } from '../src/app.js'
import { NOW, createTestContext, makeEvent } from './helpers.js'

function setup() {
  const { ctx, notifier } = createTestContext()
  return { ctx, notifier, api: request(createApp(ctx)) }
}

const postEvent = (api, event) => api.post('/api/sync/events').send(event)

describe('ground-api HTTP', () => {
  it('GET /health responde ok', async () => {
    const res = await setup().api.get('/health').expect(200)
    expect(res.body).toMatchObject({ status: 'ok', service: 'ground-api', processedEvents: 0 })
  })

  describe('POST /api/sync/events', () => {
    it('accepted: 201 con SyncAck válido, guarda el registro y notifica', async () => {
      const { api, ctx, notifier } = setup()
      const event = makeEvent()
      const res = await postEvent(api, event).expect(201)

      expect(SyncAckStrictSchema.safeParse(res.body).success).toBe(true)
      expect(res.body).toEqual({
        eventId: event.id,
        sequence: event.sequence,
        origin: 'ground',
        destination: 'onboard',
        result: 'accepted',
        receivedAt: NOW,
      })
      expect(ctx.recordStores.vital_signs.get(event.entityId)).toEqual(event.payload)
      expect(notifier.publish).toHaveBeenCalledOnce()
    })

    it('duplicate: 200, mismo UUID no se registra dos veces ni se renotifica', async () => {
      const { api, ctx, notifier } = setup()
      const event = makeEvent()
      await postEvent(api, event).expect(201)
      const res = await postEvent(api, { ...event, attempts: 2 }).expect(200)

      expect(res.body).toMatchObject({ eventId: event.id, result: 'duplicate' })
      expect(ctx.recordStores.vital_signs.size()).toBe(1)
      expect(ctx.syncLog.stats()).toMatchObject({ accepted: 1, duplicate: 1, processedEvents: 1 })
      expect(notifier.publish).toHaveBeenCalledOnce()
    })

    it('rejected: 422 con SyncAck y error si el payload incumple el contrato', async () => {
      const { api, ctx, notifier } = setup()
      const event = makeEvent({ payload: { heartRate: { value: 999, unit: 'bpm' } } })
      const res = await postEvent(api, event).expect(422)

      expect(SyncAckStrictSchema.safeParse(res.body).success).toBe(true)
      expect(res.body).toMatchObject({ eventId: event.id, result: 'rejected', error: { code: 'INVALID_EVENT' } })
      expect(res.body.error.message).toContain('payload.heartRate.value')
      expect(ctx.recordStores.vital_signs.size()).toBe(0)
      expect(notifier.publish).not.toHaveBeenCalled()
    })

    it('un evento rechazado puede aceptarse después, corregido, con el mismo UUID', async () => {
      const { api } = setup()
      const valid = makeEvent()
      const broken = { ...valid, payload: { ...valid.payload, heartRate: { value: 999, unit: 'bpm' } } }
      await postEvent(api, broken).expect(422)
      await postEvent(api, valid).expect(201)
    })

    it('400 si el evento no está dirigido a tierra (no admite SyncAck válido)', async () => {
      const { api, ctx } = setup()
      const res = await postEvent(api, makeEvent({ origin: 'ground', destination: 'onboard' })).expect(400)
      expect(res.body).toMatchObject({ error: 'El evento no está dirigido a tierra', details: { destination: 'onboard' } })
      expect(ctx.syncLog.stats().processedEvents).toBe(0)
    })

    it.each([
      ['cuerpo vacío', undefined],
      ['sin identificador válido', { foo: 'bar' }],
      ['id no UUID', { ...makeEvent(), id: 'evt-1' }],
    ])('400 si el evento no es identificable (%s)', async (_name, body) => {
      const res = await setup().api.post('/api/sync/events').send(body).expect(400)
      expect(res.body.error).toBe('Evento de sincronización no identificable')
    })

    it('tolera campos desconocidos de una versión más nueva y no los almacena', async () => {
      const { api, ctx } = setup()
      const event = makeEvent({ payload: { firmware: '2.0' }, priority: 'high' })
      await postEvent(api, event).expect(201)
      expect(ctx.recordStores.vital_signs.get(event.entityId)).not.toHaveProperty('firmware')
    })

    it('last-write-wins: una versión antigua de una alerta no sobrescribe la nueva', async () => {
      const { api, ctx, notifier } = setup()
      const alertId = crypto.randomUUID()
      const resolved = makeEvent({
        entityType: 'alert',
        operation: 'update',
        payload: { id: alertId, status: 'resolved', resolvedAt: '2026-11-14T08:00:00.000Z', updatedAt: '2026-11-14T08:00:00.000Z' },
      })
      const stale = makeEvent({ entityType: 'alert', payload: { id: alertId } })

      await postEvent(api, resolved).expect(201)
      await postEvent(api, stale).expect(201)

      expect(ctx.recordStores.alert.get(alertId).status).toBe('resolved')
      expect(notifier.publish).toHaveBeenCalledOnce()
    })
  })

  describe('consultas para el dashboard', () => {
    it('devuelve los registros recibidos por tipo y filtros', async () => {
      const { api } = setup()
      const crew = makeEvent({ entityType: 'crew_member' })
      const crewId = crew.payload.id
      await postEvent(api, crew).expect(201)
      await postEvent(api, makeEvent({ payload: { crewMemberId: crewId } })).expect(201)
      await postEvent(api, makeEvent()).expect(201)
      await postEvent(api, makeEvent({ entityType: 'wellness_check_in', payload: { crewMemberId: crewId } })).expect(201)
      await postEvent(api, makeEvent({ entityType: 'camera_metrics' })).expect(201)
      await postEvent(api, makeEvent({ entityType: 'alert' })).expect(201)

      expect((await api.get('/api/crew').expect(200)).body.count).toBe(1)
      await api.get(`/api/crew/${crewId}`).expect(200)
      await api.get(`/api/crew/${crypto.randomUUID()}`).expect(404)

      expect((await api.get('/api/vitals').expect(200)).body.count).toBe(2)
      expect((await api.get(`/api/vitals?crewMemberId=${crewId}`).expect(200)).body.count).toBe(1)
      expect((await api.get(`/api/check-ins?crewMemberId=${crewId}`).expect(200)).body.count).toBe(1)
      expect((await api.get('/api/camera-metrics').expect(200)).body.count).toBe(1)
      expect((await api.get('/api/alerts?status=acknowledged&severity=warning').expect(200)).body.count).toBe(1)
      expect((await api.get('/api/alerts?status=resolved').expect(200)).body.count).toBe(0)
    })

    it('expone el registro de sincronización y sus estadísticas', async () => {
      const { api } = setup()
      const event = makeEvent()
      await postEvent(api, event).expect(201)
      await postEvent(api, event).expect(200)
      await postEvent(api, makeEvent({ payload: { heartRate: { value: -1, unit: 'bpm' } } })).expect(422)

      const events = await api.get('/api/sync/events').expect(200)
      expect(events.body.data).toEqual([expect.objectContaining({ eventId: event.id, sequence: event.sequence })])

      const stats = await api.get('/api/sync/stats').expect(200)
      expect(stats.body.data).toMatchObject({
        accepted: 1,
        duplicate: 1,
        rejected: 1,
        lastSequenceByOrigin: { onboard: event.sequence },
      })
      expect(stats.body.data.recentRejections[0].code).toBe('INVALID_EVENT')
    })

    it('valida los parámetros de consulta', async () => {
      const { api } = setup()
      await api.get('/api/vitals?crewMemberId=ana').expect(400)
      await api.get('/api/alerts?status=closed').expect(400)
      await api.get('/api/sync/events?limit=9999').expect(400)
    })
  })
})
