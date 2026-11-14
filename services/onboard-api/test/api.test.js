import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { WellnessCheckInStrictSchema } from '@astronaut-wellness/shared'
import { createApp } from '../src/app.js'
import { CREW_ROSTER } from '../src/data/crew-roster.js'
import { createTestContext } from './helpers.js'

const CREW_ID = CREW_ROSTER[0].id
const validCheckIn = { crewMemberId: CREW_ID, mood: 4, stress: 2, fatigue: 3, sleepQuality: 3 }

function setup(options) {
  const { ctx, clock, ground } = createTestContext(options)
  return { ctx, clock, ground, api: request(createApp(ctx)) }
}

describe('onboard-api HTTP', () => {
  it('GET /health responde ok con estado del enlace y la cola', async () => {
    const res = await setup().api.get('/health').expect(200)
    expect(res.body).toMatchObject({ status: 'ok', service: 'onboard-api', link: 'connected', queue: { pending: 3 } })
  })

  it('GET /api/crew y /api/crew/:id', async () => {
    const { api } = setup()
    const list = await api.get('/api/crew').expect(200)
    expect(list.body.count).toBe(CREW_ROSTER.length)
    await api.get(`/api/crew/${CREW_ID}`).expect(200)
    await api.get(`/api/crew/${crypto.randomUUID()}`).expect(404)
  })

  describe('POST /api/check-ins', () => {
    it('registra una autoevaluación válida y la encola para tierra', async () => {
      const { api, ctx } = setup()
      const res = await api.post('/api/check-ins').send(validCheckIn).expect(201)

      const checkIn = res.body.data
      expect(WellnessCheckInStrictSchema.safeParse(checkIn).success).toBe(true)
      expect(checkIn.source).toEqual({ type: 'self_report', simulated: false })
      const event = ctx.queue.list().at(-1)
      expect(event).toMatchObject({ entityType: 'wellness_check_in', entityId: checkIn.id, status: 'pending' })

      const listed = await api.get(`/api/check-ins?crewMemberId=${CREW_ID}`).expect(200)
      expect(listed.body.data.map((c) => c.id)).toEqual([checkIn.id])
    })

    it.each([
      ['valor fuera de escala', { ...validCheckIn, mood: 9 }, 'mood'],
      ['campo mal escrito', { ...validCheckIn, moood: 3 }, ''],
      ['campo controlado por el servidor', { ...validCheckIn, id: crypto.randomUUID() }, ''],
      ['crewMemberId no UUID', { ...validCheckIn, crewMemberId: 'ana' }, 'crewMemberId'],
      ['campo obligatorio ausente', { crewMemberId: CREW_ID, mood: 3 }, 'stress'],
    ])('rechaza con 400: %s', async (_name, body, path) => {
      const res = await setup().api.post('/api/check-ins').send(body).expect(400)
      expect(res.body.error).toBe('Validation Error')
      expect(res.body.issues.map((i) => i.path)).toContain(path)
    })

    it('rechaza JSON mal formado con 400', async () => {
      await setup().api.post('/api/check-ins').set('content-type', 'application/json').send('{"mood":').expect(400)
    })

    it('responde 404 si el tripulante no existe', async () => {
      await setup().api.post('/api/check-ins').send({ ...validCheckIn, crewMemberId: crypto.randomUUID() }).expect(404)
    })
  })

  it('GET /api/vitals devuelve la telemetría simulada filtrable', async () => {
    const { api, ctx } = setup()
    ctx.services.telemetryService.tick()
    const all = await api.get('/api/vitals').expect(200)
    expect(all.body.count).toBe(3)
    expect(all.body.data.every((v) => v.source.simulated)).toBe(true)

    const one = await api.get(`/api/vitals?crewMemberId=${CREW_ID}&limit=1`).expect(200)
    expect(one.body.data).toHaveLength(1)
    await api.get('/api/vitals?limit=0').expect(400)
  })

  it('GET /api/alerts y /api/sync/status reflejan el estado del enlace', async () => {
    const { api } = setup()
    await api.put('/api/dev/link').send({ state: 'disconnected' }).expect(200)

    const alerts = await api.get('/api/alerts?status=active').expect(200)
    expect(alerts.body.data[0]).toMatchObject({ category: 'communication', severity: 'warning', origin: 'onboard' })

    const status = await api.get('/api/sync/status').expect(200)
    expect(status.body.data.link.state).toBe('disconnected')
    expect(status.body.data.queue.byStatus.pending).toBe(4)

    const events = await api.get('/api/sync/events?status=pending').expect(200)
    expect(events.body.data.map((e) => e.sequence)).toEqual([0, 1, 2, 3])
  })

  describe('controles del simulador (/api/dev)', () => {
    it('cambian el enlace, inyectan fallos, generan telemetría y fuerzan el envío', async () => {
      const { api, ground } = setup()
      await api.put('/api/dev/link').send({ latencyMs: 0, degradedFailureRate: 0.2 }).expect(200)
      const failures = await api.post('/api/dev/link/failures').send({ count: 2 }).expect(200)
      expect(failures.body.data.pendingFailures).toBe(2)

      const tick = await api.post('/api/dev/telemetry/tick').expect(201)
      expect(tick.body.count).toBe(3)

      const flush = await api.post('/api/dev/sync/flush').expect(200)
      expect(flush.body.data).toMatchObject({ sent: 1, retry: 1 })
      expect(ground.sendEvent).not.toHaveBeenCalled()
    })

    it('validan su entrada', async () => {
      const { api } = setup()
      await api.put('/api/dev/link').send({ state: 'offline' }).expect(400)
      await api.put('/api/dev/link').send({}).expect(400)
      await api.post('/api/dev/link/failures').send({ count: 0 }).expect(400)
    })

    it('no existen en producción', async () => {
      const { api } = setup({ env: { NODE_ENV: 'production' } })
      await api.put('/api/dev/link').send({ state: 'disconnected' }).expect(404)
      await api.post('/api/dev/sync/flush').expect(404)
      await api.get('/api/crew').expect(200)
    })
  })

  it('responde 404 JSON en rutas desconocidas', async () => {
    const res = await setup().api.get('/api/nope').expect(404)
    expect(res.body).toEqual({ error: 'Not Found', path: '/api/nope' })
  })
})
