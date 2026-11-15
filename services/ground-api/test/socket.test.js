import { io as connectClient } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SOCKET_EVENTS } from '@astronaut-wellness/shared'
import { loadConfig } from '../src/config.js'
import { createGroundServer } from '../src/ground-server.js'
import { silentLogger } from '../src/lib/runtime.js'
import { socketEventFor } from '../src/realtime/notifier.js'
import { fixedClock, makeEvent } from './helpers.js'

/** Servidor real en un puerto efímero (0) por prueba: sin conflictos con 4000. */
let server
let baseUrl
const clients = []

beforeEach(async () => {
  server = createGroundServer({ config: loadConfig({ NODE_ENV: 'test' }), logger: silentLogger, clock: fixedClock })
  const { port } = await server.listen(0, '127.0.0.1')
  baseUrl = `http://127.0.0.1:${port}`
})

afterEach(async () => {
  clients.splice(0).forEach((client) => client.disconnect())
  await server.close()
})

function connect() {
  const client = connectClient(baseUrl, { transports: ['websocket'], reconnection: false, forceNew: true })
  clients.push(client)
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client))
    client.once('connect_error', reject)
  })
}

const nextMessage = (client, eventName) => new Promise((resolve) => client.once(eventName, resolve))

const post = (event) =>
  fetch(`${baseUrl}/api/sync/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(event),
  })

describe('Socket.IO en ground-api', () => {
  it('emite vitals:recorded a los clientes conectados al aceptar una lectura', async () => {
    const client = await connect()
    const received = nextMessage(client, SOCKET_EVENTS.VITALS_RECORDED)
    const event = makeEvent()

    expect((await post(event)).status).toBe(201)
    expect(await received).toEqual(event.payload)
  })

  it('emite vigilance:test-recorded al aceptar una prueba de vigilancia', async () => {
    const client = await connect()
    const received = nextMessage(client, SOCKET_EVENTS.VIGILANCE_TEST_RECORDED)
    const event = makeEvent({ entityType: 'vigilance_test' })
    expect((await post(event)).status).toBe(201)
    expect(await received).toEqual(event.payload)
  })

  it('emite a todos los clientes conectados', async () => {
    const [a, b] = await Promise.all([connect(), connect()])
    const messages = Promise.all([nextMessage(a, SOCKET_EVENTS.CREW_UPDATED), nextMessage(b, SOCKET_EVENTS.CREW_UPDATED)])
    const event = makeEvent({ entityType: 'crew_member' })
    await post(event)
    expect(await messages).toEqual([event.payload, event.payload])
  })

  it('emite alert:created y alert:updated', async () => {
    const client = await connect()
    const created = nextMessage(client, SOCKET_EVENTS.ALERT_CREATED)
    const alert = makeEvent({ entityType: 'alert' })
    await post(alert)
    expect((await created).id).toBe(alert.entityId)

    const updated = nextMessage(client, SOCKET_EVENTS.ALERT_UPDATED)
    await post(
      makeEvent({
        entityType: 'alert',
        operation: 'update',
        payload: { id: alert.entityId, status: 'resolved', resolvedAt: '2026-11-14T08:00:00.000Z', updatedAt: '2026-11-14T08:00:00.000Z' },
      }),
    )
    expect(await updated).toMatchObject({ id: alert.entityId, status: 'resolved' })
  })

  it('no emite nada para duplicados ni rechazos', async () => {
    const client = await connect()
    const seen = []
    client.onAny((name, payload) => seen.push([name, payload.id]))

    const event = makeEvent()
    await post(event)
    await post(event) // duplicate
    await post(makeEvent({ payload: { heartRate: { value: 999, unit: 'bpm' } } })) // rejected
    // Un evento posterior sirve de barrera: cuando llega, los anteriores ya se habrían recibido.
    const barrier = nextMessage(client, SOCKET_EVENTS.CHECK_IN_SUBMITTED)
    await post(makeEvent({ entityType: 'wellness_check_in' }))
    await barrier

    expect(seen.map(([name]) => name)).toEqual([SOCKET_EVENTS.VITALS_RECORDED, SOCKET_EVENTS.CHECK_IN_SUBMITTED])
  })

  it('registra conexiones y desconexiones de clientes', async () => {
    const client = await connect()
    expect(server.io.sockets.sockets.size).toBe(1)

    const serverSide = server.io.sockets.sockets.get(client.id)
    const reason = new Promise((resolve) => serverSide.once('disconnect', resolve))
    client.disconnect()

    expect(await reason).toBe('client namespace disconnect')
    expect(server.io.sockets.sockets.size).toBe(0)
  })

  it('close() desconecta a los clientes y libera el puerto', async () => {
    const client = await connect()
    const disconnected = nextMessage(client, 'disconnect')
    await server.close()

    // El motivo depende de si el paquete de cierre llega antes que el cierre TCP.
    expect(['io server disconnect', 'transport close']).toContain(await disconnected)
    expect(client.connected).toBe(false)
    expect(server.httpServer.listening).toBe(false)
    // afterEach vuelve a llamar a close(): debe ser seguro.
    server = { close: async () => {} }
  })

  it('usa exclusivamente nombres definidos en SOCKET_EVENTS', () => {
    const allowed = new Set(Object.values(SOCKET_EVENTS))
    for (const entityType of ['crew_member', 'vital_signs', 'wellness_check_in', 'camera_metrics', 'alert', 'vigilance_test']) {
      for (const operation of ['create', 'update']) {
        expect(allowed.has(socketEventFor({ entityType, operation }))).toBe(true)
      }
    }
  })
})

describe('Socket.IO · alertas demostrativas (Bloque 2)', () => {
  it('create → alert:created; update de la MISMA alerta → alert:updated; reenvío duplicado → nada', async () => {
    const client = await connect()
    const seen = []
    client.on(SOCKET_EVENTS.ALERT_CREATED, (a) => seen.push(['created', a.id, a.status, a.evidence?.length]))
    client.on(SOCKET_EVENTS.ALERT_UPDATED, (a) => seen.push(['updated', a.id, a.status, a.evidence?.length]))

    const id = crypto.randomUUID()
    const evidence = (eid) => ({ entityType: 'vigilance_test', id: eid, recordedAt: '2026-11-14T07:00:00.000Z', source: { type: 'cognitive_test', simulated: false }, summary: 'PVT' })
    const base = { id, category: 'cognitive', status: 'active', rule: { id: 'demo.pvt.lapses', name: 'Lapsos', demonstrative: true }, dedupKey: 'demo.pvt.lapses:x' }
    const created = makeEvent({ entityType: 'alert', payload: { ...base, evidence: [evidence(crypto.randomUUID())], updatedAt: '2026-11-14T07:31:00.000Z' } })
    const updated = makeEvent({ entityType: 'alert', operation: 'update', payload: { ...base, evidence: [evidence(crypto.randomUUID()), ...created.payload.evidence], updatedAt: '2026-11-14T08:00:00.000Z' } })
    const resolved = makeEvent({
      entityType: 'alert',
      operation: 'update',
      payload: { ...updated.payload, status: 'resolved', resolvedAt: '2026-11-14T09:00:00.000Z', updatedAt: '2026-11-14T09:00:00.000Z' },
    })
    for (const e of [created, updated, resolved]) {
      delete e.payload.acknowledgedAt // el ejemplo base es una alerta reconocida
      delete e.payload.acknowledgedBy
    }

    expect((await post(created)).status).toBe(201)
    expect((await post(created)).status).toBe(200) // reenvío tras perder el acuse
    expect((await post(updated)).status).toBe(201)
    expect((await post(resolved)).status).toBe(201)
    expect((await post(updated)).status).toBe(200) // reenvío tardío de una versión antigua: duplicado, no reaplica
    await new Promise((r) => setTimeout(r, 100))

    expect(seen).toEqual([
      ['created', id, 'active', 1],
      ['updated', id, 'active', 2],
      ['updated', id, 'resolved', 2],
    ])
    const stored = (await (await fetch(`${baseUrl}/api/alerts?limit=50`)).json()).data.filter((a) => a.id === id)
    expect(stored).toHaveLength(1)
    expect(stored[0].status).toBe('resolved')
  })
})
