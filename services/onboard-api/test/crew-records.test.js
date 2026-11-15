import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { CameraMetricsStrictSchema, VigilanceTestStrictSchema } from '@astronaut-wellness/shared'
import { exampleCameraMetrics, exampleVigilanceTest } from '@astronaut-wellness/shared/examples'
import { createApp } from '../src/app.js'
import { CREW_ROSTER } from '../src/data/crew-roster.js'
import { createTestContext } from './helpers.js'

const CREW_ID = CREW_ROSTER[0].id
const withoutServerFields = ({ id: _id, recordedAt: _r, source: _s, ...rest }) => rest

function setup() {
  const { ctx, ground } = createTestContext()
  return { ctx, ground, api: request(createApp(ctx)) }
}

const cameraBody = () => ({ ...withoutServerFields(structuredClone(exampleCameraMetrics)), crewMemberId: CREW_ID, model: { name: 'mediapipe-face-landmarker', version: '1.2.3' } })
const pvtBody = () => ({ ...withoutServerFields(structuredClone(exampleVigilanceTest)), crewMemberId: CREW_ID })

describe('POST /api/camera-metrics', () => {
  it('guarda métricas agregadas reales con procedencia de cámara y las encola para tierra', async () => {
    const { api, ctx } = setup()
    const res = await api.post('/api/camera-metrics').send(cameraBody()).expect(201)

    expect(CameraMetricsStrictSchema.safeParse(res.body.data).success).toBe(true)
    expect(res.body.data.source).toEqual({ type: 'camera', simulated: false, deviceId: 'onboard-browser-camera' })
    expect(ctx.queue.list().at(-1)).toMatchObject({ entityType: 'camera_metrics', entityId: res.body.data.id, status: 'pending' })

    const listed = await api.get(`/api/camera-metrics?crewMemberId=${CREW_ID}`).expect(200)
    expect(listed.body.data.map((m) => m.id)).toEqual([res.body.data.id])
  })

  it('rechaza con 400 campos del servidor, métricas fuera de dominio y erratas', async () => {
    const { api } = setup()
    const withSource = await api.post('/api/camera-metrics').send({ ...cameraBody(), source: { type: 'camera', simulated: true } }).expect(400)
    expect(withSource.body.issues.map((i) => i.path)).toEqual(['source'])

    const bad = await api.post('/api/camera-metrics').send({ ...cameraBody(), eyeClosureRatio: { value: 1.5, unit: 'ratio' } }).expect(400)
    expect(bad.body.issues.map((i) => i.path)).toContain('eyeClosureRatio.value')

    await api.post('/api/camera-metrics').send({ ...cameraBody(), blinkRat: 3 }).expect(400)
    await api.post('/api/camera-metrics').send('[]').set('content-type', 'application/json').expect(400)
  })

  it('404 si el tripulante no existe; 400 si el identificador no es válido', async () => {
    const { api } = setup()
    await api.post('/api/camera-metrics').send({ ...cameraBody(), crewMemberId: crypto.randomUUID() }).expect(404)
    const res = await api.post('/api/camera-metrics').send({ ...cameraBody(), crewMemberId: 'ana' }).expect(400)
    expect(res.body.issues.map((i) => i.path)).toContain('crewMemberId')
  })
})

describe('POST /api/vigilance-tests', () => {
  it('guarda una prueba PVT verificable con procedencia de prueba cognitiva y la encola', async () => {
    const { api, ctx } = setup()
    const res = await api.post('/api/vigilance-tests').send(pvtBody()).expect(201)

    expect(VigilanceTestStrictSchema.safeParse(res.body.data).success).toBe(true)
    expect(res.body.data.source).toEqual({ type: 'cognitive_test', simulated: false, deviceId: 'onboard-ui' })
    expect(ctx.queue.list().find((e) => e.entityType === 'vigilance_test')).toMatchObject({ entityId: res.body.data.id })
    expect((await api.get('/api/vigilance-tests').expect(200)).body.count).toBe(1)
  })

  it('rechaza un resumen manipulado (no coincide con los ensayos)', async () => {
    const { api, ctx } = setup()
    const body = pvtBody()
    body.summary.lapseCount = 0
    const res = await api.post('/api/vigilance-tests').send(body).expect(400)
    expect(res.body.issues.map((i) => i.path)).toContain('summary.lapseCount')
    expect(ctx.stores.vigilanceTests.size()).toBe(0)
  })

  it('se sincroniza hacia tierra con el mismo contrato', async () => {
    const { api, ctx, ground } = setup()
    const res = await api.post('/api/vigilance-tests').send(pvtBody()).expect(201)
    await ctx.worker.flush()
    expect(ground.stored.get(ctx.queue.list().find((e) => e.entityType === 'vigilance_test').id).payload).toEqual(res.body.data)
  })
})

describe('Fixtures de prueba (X-Data-Fixture)', () => {
  it('en desarrollo, un fixture se guarda como SIMULADO; sin la cabecera es un dato real', async () => {
    const { api } = setup()
    const fixture = await api.post('/api/camera-metrics').set('X-Data-Fixture', '1').send(cameraBody()).expect(201)
    expect(fixture.body.data.source).toEqual({ type: 'camera', simulated: true, deviceId: 'e2e-fixture' })
    const pvt = await api.post('/api/vigilance-tests').set('X-Data-Fixture', '1').send(pvtBody()).expect(201)
    expect(pvt.body.data.source).toMatchObject({ type: 'cognitive_test', simulated: true })
    const real = await api.post('/api/camera-metrics').send(cameraBody()).expect(201)
    expect(real.body.data.source.simulated).toBe(false)
  })

  it('en producción la cabecera se ignora (no hay controles de desarrollo)', async () => {
    const { ctx } = createTestContext({ env: { NODE_ENV: 'production' } })
    const res = await request(createApp(ctx)).post('/api/camera-metrics').set('X-Data-Fixture', '1').send(cameraBody()).expect(201)
    expect(res.body.data.source.simulated).toBe(false)
  })
})

describe('Procedencia: un cliente no puede atribuirse una procedencia', () => {
  it('rechaza (400) una PVT que trae su propio `source`, sea real o simulado', async () => {
    const { api, ctx } = setup()
    for (const source of [{ type: 'cognitive_test', simulated: false, deviceId: 'onboard-ui' }, { type: 'cognitive_test', simulated: true }]) {
      const res = await api.post('/api/vigilance-tests').send({ ...pvtBody(), source }).expect(400)
      expect(res.body.issues.map((i) => i.path)).toEqual(['source'])
    }
    expect(ctx.stores.vigilanceTests.size()).toBe(0)
  })

  it('la cabecera de fixture solo REBAJA la procedencia (simulado) y no relaja la validación estricta', async () => {
    const { api } = setup()
    const body = pvtBody()
    body.summary.lapseCount = 99
    await api.post('/api/vigilance-tests').set('X-Data-Fixture', '1').send(body).expect(400)
    await api.post('/api/vigilance-tests').set('X-Data-Fixture', '0').send(pvtBody()).expect(201).then((r) => expect(r.body.data.source.simulated).toBe(false))
  })
})
