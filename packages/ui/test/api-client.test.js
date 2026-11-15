import { describe, expect, it } from 'vitest'
import { ApiError, buildUrl, createApiClient, isAbortError } from '../src/data/api-client.js'
import { createFetchMock, deferred, httpResponse } from './helpers.js'

const setup = (responder) => {
  const fetchImpl = createFetchMock(responder)
  return { fetchImpl, client: createApiClient({ baseUrl: '/api', fetchImpl }) }
}

describe('buildUrl', () => {
  it('usa rutas relativas y omite parámetros vacíos', () => {
    expect(buildUrl('/api', '/vitals', { crewMemberId: 'abc', limit: 0, status: undefined, severity: null, q: '' })).toBe(
      '/api/vitals?crewMemberId=abc&limit=0',
    )
    expect(buildUrl('/api', '/crew')).toBe('/api/crew')
  })
})

describe('createApiClient · respuestas correctas', () => {
  it('conserva { data, count } y { data } sin transformarlos', async () => {
    const { client } = setup((url) =>
      url.endsWith('/crew') ? httpResponse(200, { data: [{ id: 1 }], count: 1 }) : httpResponse(200, { data: { id: 1 } }),
    )
    await expect(client.get('/crew')).resolves.toEqual({ data: [{ id: 1 }], count: 1 })
    await expect(client.get('/crew/1')).resolves.toEqual({ data: { id: 1 } })
  })

  it('una lista vacía o un cuerpo vacío no son errores', async () => {
    const { client } = setup((url) => (url.endsWith('/empty') ? httpResponse(200, { data: [], count: 0 }) : httpResponse(204)))
    await expect(client.get('/empty')).resolves.toEqual({ data: [], count: 0 })
    await expect(client.get('/no-content')).resolves.toBeNull()
  })

  it('withStatus devuelve también el estado HTTP (p. ej. para exigir 201)', async () => {
    const { client } = setup(() => httpResponse(201, { data: { id: 'x' } }))
    await expect(client.post('/check-ins', {}, { withStatus: true })).resolves.toEqual({ status: 201, body: { data: { id: 'x' } } })
  })

  it('POST y PUT envían JSON con sus cabeceras; sin cuerpo no envían content-type', async () => {
    const { client, fetchImpl } = setup(() => httpResponse(201, { data: { ok: true } }))
    await client.post('/check-ins', { mood: 3 })
    await client.put('/dev/link', { state: 'degraded' })
    await client.post('/dev/sync/flush')

    const [[url1, post], [, put], [, empty]] = fetchImpl.mock.calls
    expect(url1).toBe('/api/check-ins')
    expect(post).toMatchObject({ method: 'POST', body: '{"mood":3}', headers: { 'content-type': 'application/json' } })
    expect(put).toMatchObject({ method: 'PUT', body: '{"state":"degraded"}' })
    expect(empty.body).toBeUndefined()
    expect(empty.headers).not.toHaveProperty('content-type')
  })
})

describe('createApiClient · errores normalizados (ApiError)', () => {
  it('400 conserva los issues de validación por campo', async () => {
    const issues = [{ path: 'mood', code: 'too_big', message: 'Too big' }]
    const { client } = setup(() => httpResponse(400, { error: 'Validation Error', issues }))
    const error = await client.post('/check-ins', {}).catch((e) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'HTTP_400', message: 'Validation Error', issues })
    expect(error.fieldErrors).toEqual({ mood: 'Too big' })
  })

  it.each([
    [404, { error: 'Tripulante no encontrado: x' }, 'Tripulante no encontrado: x'],
    [409, { error: 'El tripulante x no está activo' }, 'El tripulante x no está activo'],
    [500, { error: 'Internal Server Error' }, 'Internal Server Error'],
    [503, undefined, 'La API respondió con HTTP 503'],
  ])('HTTP %i → ApiError con el mensaje de la API', async (status, body, message) => {
    const { client } = setup(() => httpResponse(status, body))
    await expect(client.get('/x')).rejects.toMatchObject({ name: 'ApiError', status, code: `HTTP_${status}`, message, issues: [] })
  })

  it('error de red → ApiError NETWORK_ERROR con status 0', async () => {
    const { client } = setup(() => Promise.reject(new TypeError('Failed to fetch')))
    await expect(client.get('/crew')).rejects.toMatchObject({ name: 'ApiError', status: 0, code: 'NETWORK_ERROR' })
  })

  it('JSON inválido → ApiError INVALID_JSON', async () => {
    const { client } = setup(() => httpResponse(200, '<!doctype html><html>'))
    await expect(client.get('/crew')).rejects.toMatchObject({ code: 'INVALID_JSON', status: 200 })
  })
})

describe('createApiClient · cancelación y peticiones compartidas', () => {
  it('cancelar propaga un AbortError (no un ApiError)', async () => {
    const pending = deferred()
    const { client } = setup(() => pending.promise)
    const controller = new AbortController()
    const request = client.post('/check-ins', {}, { signal: controller.signal })
    controller.abort()
    const error = await request.catch((e) => e)
    expect(isAbortError(error)).toBe(true)
    expect(error).not.toBeInstanceOf(ApiError)
  })

  it('GET simultáneas a la misma URL comparten una sola petición de red', async () => {
    const pending = deferred()
    let calls = 0
    const { client, fetchImpl } = setup(() => (calls++ === 0 ? pending.promise : httpResponse(200, { data: [], count: 0 })))
    const a = client.get('/crew')
    const b = client.get('/crew')
    pending.resolve(httpResponse(200, { data: [], count: 0 }))
    await expect(Promise.all([a, b])).resolves.toEqual([
      { data: [], count: 0 },
      { data: [], count: 0 },
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    await client.get('/crew') // terminada la anterior, una nueva GET vuelve a la red
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('si uno de los interesados cancela, la petición compartida continúa para el resto', async () => {
    const pending = deferred()
    const { client, fetchImpl } = setup(() => pending.promise)
    const first = new AbortController()
    const a = client.get('/crew', { signal: first.signal })
    const b = client.get('/crew')

    first.abort()
    await expect(a).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(false)

    pending.resolve(httpResponse(200, { data: [1], count: 1 }))
    await expect(b).resolves.toEqual({ data: [1], count: 1 })
  })

  it('si todos cancelan, se cancela la petición de red', async () => {
    const { client, fetchImpl } = setup(() => new Promise(() => {}))
    const controller = new AbortController()
    const request = client.get('/crew', { signal: controller.signal })
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    await Promise.resolve()
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true)
  })

  it('POST no se comparte: cada llamada es una operación', async () => {
    const { client, fetchImpl } = setup(() => httpResponse(201, { data: {} }))
    await Promise.all([client.post('/check-ins', { a: 1 }), client.post('/check-ins', { a: 1 })])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})
