import { describe, expect, it, vi } from 'vitest'
import { exampleSyncAck, exampleSyncEvent } from '@astronaut-wellness/shared/examples'
import { createGroundClient } from '../src/sync/ground-client.js'

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function clientReturning(responseOrError) {
  const fetchImpl = vi.fn(async () => {
    if (responseOrError instanceof Error) throw responseOrError
    return responseOrError
  })
  return { client: createGroundClient({ baseUrl: 'http://ground.test', fetchImpl }), fetchImpl }
}

describe('cliente HTTP hacia Ground API', () => {
  it('hace POST /api/sync/events con el evento en JSON', async () => {
    const { client, fetchImpl } = clientReturning(jsonResponse(201, exampleSyncAck))
    await client.sendEvent(exampleSyncEvent)

    const [url, init] = fetchImpl.mock.calls[0]
    expect(String(url)).toBe('http://ground.test/api/sync/events')
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } })
    expect(JSON.parse(init.body).id).toBe(exampleSyncEvent.id)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it.each([
    [201, 'accepted'],
    [200, 'duplicate'],
    [422, 'rejected'],
  ])('HTTP %i devuelve el SyncAck (%s)', async (status, result) => {
    const ack = { ...exampleSyncAck, result, ...(result === 'rejected' && { error: { code: 'X', message: 'y' } }) }
    const { client } = clientReturning(jsonResponse(status, ack))
    await expect(client.sendEvent(exampleSyncEvent)).resolves.toMatchObject({ result })
  })

  it.each([
    [500, true],
    [503, true],
    [429, true],
    [400, false],
    [404, false],
  ])('HTTP %i → error con retryable=%s', async (status, retryable) => {
    const { client } = clientReturning(jsonResponse(status, { error: 'fallo' }))
    await expect(client.sendEvent(exampleSyncEvent)).rejects.toMatchObject({ code: `HTTP_${status}`, retryable })
  })

  it('un SyncAck mal formado es un error recuperable', async () => {
    const { client } = clientReturning(jsonResponse(201, { ok: true }))
    await expect(client.sendEvent(exampleSyncEvent)).rejects.toMatchObject({ code: 'INVALID_ACK', retryable: true })
  })

  it('errores de red y timeouts son recuperables', async () => {
    await expect(clientReturning(new TypeError('fetch failed')).client.sendEvent(exampleSyncEvent))
      .rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true })
    const timeout = new DOMException('timeout', 'TimeoutError')
    await expect(clientReturning(timeout).client.sendEvent(exampleSyncEvent))
      .rejects.toMatchObject({ code: 'TIMEOUT', retryable: true })
  })
})
