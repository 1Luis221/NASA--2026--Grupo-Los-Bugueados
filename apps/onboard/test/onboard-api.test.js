import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from '@astronaut-wellness/ui'
import { ONBOARD_POLL_INTERVAL_MS, createOnboardApi } from '../src/api/onboard-api.js'

const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status })

function setup(response = () => json(200, { data: [], count: 0 })) {
  const fetchImpl = vi.fn(async () => response())
  return { fetchImpl, api: createOnboardApi(createApiClient({ baseUrl: '/api', fetchImpl })) }
}

describe('Onboard API · endpoints consumidos', () => {
  it.each([
    ['listCrew', [], 'GET', '/api/crew'],
    ['listVitals', [{ crewMemberId: 'abc', limit: 50 }], 'GET', '/api/vitals?crewMemberId=abc&limit=50'],
    ['listCheckIns', [{ crewMemberId: 'abc' }], 'GET', '/api/check-ins?crewMemberId=abc'],
    ['listAlerts', [{ status: 'active' }], 'GET', '/api/alerts?status=active'],
    ['getSyncStatus', [], 'GET', '/api/sync/status'],
    ['listSyncEvents', [{ status: 'retry_scheduled' }], 'GET', '/api/sync/events?status=retry_scheduled'],
  ])('%s → %s %s', async (method, args, verb, url) => {
    const { api, fetchImpl } = setup()
    await api[method](...args)
    expect(fetchImpl).toHaveBeenCalledWith(url, expect.objectContaining({ method: verb }))
  })

  it('submitCheckIn hace POST con el cuerpo en JSON y devuelve el estado HTTP y { data }', async () => {
    const created = { id: 'x', mood: 4 }
    const { api, fetchImpl } = setup(() => json(201, { data: created }))
    const body = { crewMemberId: 'abc', mood: 4, stress: 2, fatigue: 3, sleepQuality: 3 }

    await expect(api.submitCheckIn(body)).resolves.toEqual({ status: 201, body: { data: created } })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('/api/check-ins')
    expect(JSON.parse(init.body)).toEqual(body)
  })

  it.each([
    [400, { error: 'Validation Error', issues: [{ path: 'mood', code: 'too_big', message: 'Too big' }] }],
    [404, { error: 'Tripulante no encontrado: abc' }],
    [409, { error: 'El tripulante abc no está activo' }],
  ])('submitCheckIn con HTTP %i lanza ApiError con el detalle de la API', async (status, body) => {
    const { api } = setup(() => json(status, body))
    const error = await api.submitCheckIn({}).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status, message: body.error, issues: body.issues ?? [] })
  })

  it.each([
    ['getLink', [], 'GET', '/api/dev/link', undefined],
    ['updateLink', [{ state: 'disconnected' }], 'PUT', '/api/dev/link', { state: 'disconnected' }],
    ['injectFailures', [2], 'POST', '/api/dev/link/failures', { count: 2 }],
    ['tickTelemetry', [], 'POST', '/api/dev/telemetry/tick', undefined],
    ['flushSync', [], 'POST', '/api/dev/sync/flush', undefined],
  ])('dev.%s → %s %s', async (method, args, verb, url, body) => {
    const fetchImpl = vi.fn(async () => json(200, { data: {} }))
    const api = createOnboardApi(createApiClient({ baseUrl: '/api', fetchImpl }), { devTools: true })
    await api.dev[method](...args)
    const [calledUrl, init] = fetchImpl.mock.calls[0]
    expect([calledUrl, init.method]).toEqual([url, verb])
    expect(init.body === undefined ? undefined : JSON.parse(init.body)).toEqual(body)
  })

  it('en producción no existen los controles /api/dev (no se pueden llamar)', () => {
    const fetchImpl = vi.fn()
    const api = createOnboardApi(createApiClient({ baseUrl: '/api', fetchImpl }), { devTools: false })
    expect(api.dev).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('sondeo previsto de aproximadamente 3 s', () => {
    expect(ONBOARD_POLL_INTERVAL_MS).toBe(3000)
  })
})

describe('Onboard API · procedencia de la PVT', () => {
  const body = { crewMemberId: 'abc', testType: 'pvt' }
  const headersOf = (fetchImpl) => fetchImpl.mock.calls[0][1].headers

  it('una PVT de una persona se envía sin cabecera de fixture', async () => {
    const { api, fetchImpl } = setup(() => json(201, { data: {} }))
    await api.submitVigilanceTest(body)
    expect(headersOf(fetchImpl)).not.toHaveProperty('X-Data-Fixture')
  })

  it('una PVT automatizada (desarrollo) se envía con X-Data-Fixture para guardarse como simulada', async () => {
    const { api, fetchImpl } = setup(() => json(201, { data: {} }))
    await api.submitVigilanceTest(body, { automated: true })
    expect(headersOf(fetchImpl)).toMatchObject({ 'X-Data-Fixture': '1' })
  })

  it('sin herramientas de desarrollo no se envía la cabecera', async () => {
    const fetchImpl = vi.fn(async () => json(201, { data: {} }))
    const api = createOnboardApi(createApiClient({ baseUrl: '/api', fetchImpl }), { devTools: false })
    await api.submitVigilanceTest(body, { automated: true })
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('X-Data-Fixture')
  })
})
