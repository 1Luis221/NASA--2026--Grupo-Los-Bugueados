import { io as connectClient } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SOCKET_EVENTS } from '@astronaut-wellness/shared'
import { createGroundServer, loadConfig as loadGroundConfig } from '@astronaut-wellness/ground-api'
import { CREW_ROSTER } from '../src/data/crew-roster.js'
import { silentLogger } from '../src/lib/runtime.js'
import { createGroundClient } from '../src/sync/ground-client.js'
import { createTestContext, networkError } from './helpers.js'

/**
 * Integración real nave ↔ tierra por HTTP: un ground-api completo (Express +
 * Socket.IO) en un puerto efímero local. Sin servicios externos.
 */
let ground
let groundUrl
let onboard
const sockets = []

beforeEach(async () => {
  ground = createGroundServer({ config: loadGroundConfig({ NODE_ENV: 'test' }), logger: silentLogger })
  const { port } = await ground.listen(0, '127.0.0.1')
  groundUrl = `http://127.0.0.1:${port}`
})

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.disconnect())
  await onboard?.ctx.stop()
  await ground.close()
  expect(ground.httpServer.listening).toBe(false)
})

function startOnboard(wrapClient = (client) => client) {
  const realClient = createGroundClient({ baseUrl: groundUrl, timeoutMs: 2000 })
  onboard = createTestContext({ groundClient: wrapClient(realClient) })
  return onboard
}

const groundStats = () => ground.ctx.syncLog.stats()
const groundCount = (entityType) => ground.ctx.recordStores[entityType].size()

describe('integración nave ↔ tierra', () => {
  it('A · comunicación normal: el evento llega y tierra responde accepted', async () => {
    const { ctx } = startOnboard()
    ctx.services.telemetryService.tick()

    const summary = await ctx.worker.flush()

    expect(summary).toMatchObject({ sent: 6, accepted: 6, duplicate: 0, rejected: 0 })
    expect(ctx.queue.stats().byStatus.acknowledged).toBe(6)
    expect(groundCount('crew_member')).toBe(CREW_ROSTER.length)
    expect(groundCount('vital_signs')).toBe(3)
    expect(groundStats()).toMatchObject({ accepted: 6, duplicate: 0, rejected: 0 })
  })

  it('B · pérdida de comunicación: los eventos quedan pendientes en la cola local', async () => {
    const { ctx } = startOnboard()
    await ctx.worker.flush()
    ctx.link.setState('disconnected')
    ctx.services.telemetryService.tick()
    ctx.services.checkInService.submit({ crewMemberId: CREW_ROSTER[0].id, mood: 3, stress: 3, fatigue: 4, sleepQuality: 2 })

    const summary = await ctx.worker.flush()

    expect(summary.skipped).toBe(true)
    // alerta de enlace + 3 lecturas + 1 autoevaluación
    expect(ctx.queue.stats().byStatus).toMatchObject({ pending: 5, acknowledged: 3 })
    expect(groundCount('vital_signs')).toBe(0)
    expect(groundStats().accepted).toBe(3)
  })

  it('C · reconexión: se envían los pendientes y tierra confirma, sin duplicados', async () => {
    const { ctx } = startOnboard()
    ctx.link.setState('disconnected')
    ctx.services.telemetryService.tick()
    ctx.services.telemetryService.tick()

    ctx.link.setState('connected')
    await ctx.worker.flush()

    const total = ctx.queue.stats().total
    expect(ctx.queue.stats().byStatus).toMatchObject({ pending: 0, acknowledged: total })
    expect(groundStats()).toMatchObject({ accepted: total, duplicate: 0, processedEvents: total })
    expect(groundCount('vital_signs')).toBe(6)
    // La alerta de enlace llega creada y después resuelta.
    const [alert] = ground.ctx.recordStores.alert.list()
    expect(alert).toMatchObject({ category: 'communication', status: 'resolved' })
  })

  it('D · duplicación: el mismo UUID dos veces → duplicate y un único registro', async () => {
    const { ctx } = startOnboard()
    const client = createGroundClient({ baseUrl: groundUrl })
    const [event] = ctx.queue.list()

    const first = await client.sendEvent({ ...event, status: 'sending', attempts: 1, lastAttemptAt: event.createdAt })
    const second = await client.sendEvent({ ...event, status: 'sending', attempts: 2, lastAttemptAt: event.createdAt })

    expect(first).toMatchObject({ eventId: event.id, result: 'accepted' })
    expect(second).toMatchObject({ eventId: event.id, sequence: event.sequence, result: 'duplicate' })
    expect(groundCount('crew_member')).toBe(1)
    expect(groundStats()).toMatchObject({ accepted: 1, duplicate: 1 })
  })

  it('D · acuse perdido: el reintento conserva UUID y secuencia y no duplica en tierra', async () => {
    let calls = 0
    const { ctx, clock } = startOnboard((real) => ({
      async sendEvent(event) {
        const ack = await real.sendEvent(event) // tierra lo procesa…
        if (calls++ === 0) throw networkError('TIMEOUT') // …pero el acuse se pierde
        return ack
      },
    }))

    await ctx.worker.flush()
    const head = ctx.queue.list()[0]
    expect(head).toMatchObject({ status: 'retry_scheduled', attempts: 1 })

    clock.advance(1000)
    await ctx.worker.flush()

    expect(ctx.queue.get(head.id)).toMatchObject({ id: head.id, sequence: head.sequence, status: 'acknowledged', attempts: 2 })
    expect(groundStats()).toMatchObject({ accepted: 3, duplicate: 1, processedEvents: 3 })
    expect(groundCount('crew_member')).toBe(3)
  })

  it('E · tiempo real: tierra emite por Socket.IO lo recibido de la nave', async () => {
    const socket = connectClient(groundUrl, { transports: ['websocket'], reconnection: false, forceNew: true })
    sockets.push(socket)
    await new Promise((resolve, reject) => socket.once('connect', resolve).once('connect_error', reject))

    const vitals = []
    socket.on(SOCKET_EVENTS.VITALS_RECORDED, (payload) => vitals.push(payload))
    const allReceived = new Promise((resolve) => {
      socket.on(SOCKET_EVENTS.VITALS_RECORDED, () => vitals.length === 3 && resolve())
    })

    const { ctx } = startOnboard()
    const readings = ctx.services.telemetryService.tick()
    await ctx.worker.flush()
    await allReceived

    expect(vitals.map((v) => v.id).sort()).toEqual(readings.map((r) => r.id).sort())
    expect(vitals.every((v) => v.source.simulated === true)).toBe(true)
  })
})
