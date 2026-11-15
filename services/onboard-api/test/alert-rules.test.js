import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { AlertStrictSchema, PVT_DEFAULT_PROTOCOL, classifyPvtTrial, summarizePvtTrials } from '@astronaut-wellness/shared'
import { DEMO_ALERT_RULES, resolveRules } from '../src/alerts/demo-rules.js'
import { createApp } from '../src/app.js'
import { CREW_ROSTER } from '../src/data/crew-roster.js'
import { createTestContext } from './helpers.js'

const CREW_ID = CREW_ROSTER[0].id

function setup(env) {
  const { ctx, ground, clock } = createTestContext({ env })
  return { ctx, ground, clock, api: request(createApp(ctx)) }
}

/** PVT válida a partir de tiempos de reacción (null = omisión, 'fs' = falsa salida sin estímulo). */
function pvt(rts, protocol = PVT_DEFAULT_PROTOCOL) {
  const trials = rts.map((rt, index) => {
    const t = rt === 'fs' ? { index, stimulusOffsetMs: null, reactionTimeMs: null } : { index, stimulusOffsetMs: 1000 + index * 3000, reactionTimeMs: rt }
    return { ...t, outcome: classifyPvtTrial(t, protocol) }
  })
  return { crewMemberId: CREW_ID, testType: 'pvt', protocol: { ...protocol }, trials, summary: summarizePvtTrials(trials, protocol) }
}
const clean = () => pvt(Array(20).fill(250))
const withLapses = (n) => pvt([...Array(20).fill(250), ...Array(n).fill(500)])

const checkIn = (extra = {}) => ({ crewMemberId: CREW_ID, mood: 3, stress: 2, fatigue: 3, sleepQuality: 3, ...extra })
const alertsOf = (ctx, ruleId) => ctx.stores.alerts.list({ filter: (a) => a.rule?.id === ruleId })

describe('Reglas de alerta demostrativas · PVT', () => {
  it('lapsos ≥ umbral → alerta cognitiva demostrativa con regla, evidencia, procedencia, tripulante y momento', async () => {
    const { api, ctx } = setup()
    const test = (await api.post('/api/vigilance-tests').send(withLapses(5)).expect(201)).body.data
    const [alert] = alertsOf(ctx, 'demo.pvt.lapses')

    expect(AlertStrictSchema.safeParse(alert).success).toBe(true)
    expect(alert).toMatchObject({
      crewMemberId: CREW_ID,
      category: 'cognitive',
      severity: 'warning',
      status: 'active',
      origin: 'onboard',
      rule: { id: 'demo.pvt.lapses', demonstrative: true, parameters: { minLapses: 5, lapseThresholdMs: 355 } },
      relatedRecord: { entityType: 'vigilance_test', id: test.id },
      dedupKey: `demo.pvt.lapses:${CREW_ID}`,
    })
    expect(alert.evidence).toEqual([
      expect.objectContaining({ entityType: 'vigilance_test', id: test.id, recordedAt: test.recordedAt, source: { type: 'cognitive_test', simulated: false } }),
    ])
    expect(alert.message).toMatch(/umbral de demostración.*no diagnóstico/)
    // Se encola para Tierra después del propio registro.
    expect(ctx.queue.list().slice(-2).map((e) => e.entityType)).toEqual(['vigilance_test', 'alert'])
  })

  it('por debajo del umbral no hay alerta', async () => {
    const { api, ctx } = setup()
    await api.post('/api/vigilance-tests').send(withLapses(4)).expect(201)
    expect(alertsOf(ctx, 'demo.pvt.lapses')).toHaveLength(0)
  })

  it('deduplica: una sola alerta abierta por regla y tripulante; se actualiza con la nueva evidencia y se resuelve cuando deja de cumplirse', async () => {
    const { api, ctx } = setup()
    const first = (await api.post('/api/vigilance-tests').send(withLapses(6)).expect(201)).body.data
    const second = (await api.post('/api/vigilance-tests').send(withLapses(7)).expect(201)).body.data

    let alerts = alertsOf(ctx, 'demo.pvt.lapses')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].evidence.map((e) => e.id)).toEqual([second.id, first.id])
    const ops = ctx.queue.list().filter((e) => e.entityType === 'alert').map((e) => e.operation)
    expect(ops).toEqual(['create', 'update'])

    await api.post('/api/vigilance-tests').send(clean()).expect(201)
    alerts = alertsOf(ctx, 'demo.pvt.lapses')
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ status: 'resolved', resolvedAt: expect.any(String) })
  })

  it('un mismo registro no se evalúa dos veces', () => {
    const { ctx } = setup()
    const test = ctx.services.vigilanceTestService.submit(withLapses(6))
    const before = ctx.queue.size?.() ?? ctx.queue.list().length
    expect(ctx.services.alertService.evaluateRecord('vigilance_test', test)).toEqual([])
    expect(ctx.queue.list().length).toBe(before)
  })

  it('errores (falsas salidas + omisiones) ≥ umbral', async () => {
    const { api, ctx } = setup()
    await api.post('/api/vigilance-tests').send(pvt([...Array(20).fill(250), 'fs', 50, null])).expect(201)
    const [alert] = alertsOf(ctx, 'demo.pvt.errors')
    expect(alert.message).toMatch(/2 falsas salidas y 1 omisiones/)
  })

  it('línea base personal: solo con suficientes pruebas previas del mismo protocolo; compara el TR medio', async () => {
    const { api, ctx } = setup()
    for (let i = 0; i < 2; i++) await api.post('/api/vigilance-tests').send(clean()).expect(201)
    await api.post('/api/vigilance-tests').send(pvt(Array(20).fill(320))).expect(201) // sin línea base suficiente (2 < 3)
    expect(alertsOf(ctx, 'demo.pvt.baseline')).toHaveLength(0)

    // Ahora la línea base son las 3 anteriores: 250, 250, 320 → media 273,3; 340 es +24 %.
    const slow = (await api.post('/api/vigilance-tests').send(pvt(Array(20).fill(340))).expect(201)).body.data
    const [alert] = alertsOf(ctx, 'demo.pvt.baseline')
    expect(alert.rule.parameters).toMatchObject({ baselineTests: 3, minIncreasePercent: 20, baselineMeanMs: 273.3 })
    expect(alert.evidence[0].id).toBe(slow.id)
    expect(alert.evidence).toHaveLength(4) // la prueba + su línea base
  })
})

describe('Reglas de alerta demostrativas · somnolencia autodeclarada', () => {
  it('KSS ≥ umbral → alerta de bienestar con la autoevaluación como evidencia; sin KSS no cambia nada', async () => {
    const { api, ctx } = setup()
    await api.post('/api/check-ins').send(checkIn()).expect(201)
    expect(alertsOf(ctx, 'demo.sleepiness.self_report')).toHaveLength(0)

    const c = (await api.post('/api/check-ins').send(checkIn({ sleepiness: 8, sleepDuration: { value: 5, unit: 'h' } })).expect(201)).body.data
    const [alert] = alertsOf(ctx, 'demo.sleepiness.self_report')
    expect(alert).toMatchObject({ category: 'wellness', status: 'active', rule: { demonstrative: true, parameters: { minKss: 7 } } })
    expect(alert.evidence[0]).toMatchObject({ entityType: 'wellness_check_in', id: c.id, source: { type: 'self_report', simulated: false } })
    expect(alert.evidence[0].summary).toBe('KSS 8/9 · fatiga 3/5 · 5,0 h de sueño')

    await api.post('/api/check-ins').send(checkIn()).expect(201) // sin dato de somnolencia: se mantiene
    expect(alertsOf(ctx, 'demo.sleepiness.self_report')[0].status).toBe('active')
    await api.post('/api/check-ins').send(checkIn({ sleepiness: 3 })).expect(201)
    expect(alertsOf(ctx, 'demo.sleepiness.self_report')[0].status).toBe('resolved')
  })

  it('rechaza somnolencia fuera de la escala KSS (1–9)', async () => {
    const { api } = setup()
    await api.post('/api/check-ins').send(checkIn({ sleepiness: 10 })).expect(400)
    await api.post('/api/check-ins').send(checkIn({ sleepiness: 0 })).expect(400)
  })
})

describe('Reglas de calidad de datos (datos ausentes o desactualizados)', () => {
  it('distingue datos insuficientes de bienestar, no se repite en cada comprobación y se resuelve al llegar datos', () => {
    const { ctx, clock } = setup()
    expect(ctx.checkStaleness()).toEqual([]) // recién arrancado: dentro del margen
    clock.advance(11 * 60_000) // > 10 min sin telemetría

    ctx.checkStaleness()
    const stale = alertsOf(ctx, 'data.vitals.stale')
    expect(stale).toHaveLength(CREW_ROSTER.filter((c) => c.status === 'active').length)
    expect(stale[0]).toMatchObject({ category: 'data_quality', severity: 'info', rule: { demonstrative: true, parameters: { maxAgeMinutes: 10 } } })
    expect(stale[0].message).toMatch(/calidad de datos, no de bienestar/)

    const queued = ctx.queue.list().length
    clock.advance(60_000)
    ctx.checkStaleness()
    expect(ctx.queue.list().length).toBe(queued) // sin cambios: ni duplicados ni actualizaciones

    ctx.services.telemetryService.tick()
    ctx.checkStaleness()
    expect(alertsOf(ctx, 'data.vitals.stale').every((a) => a.status === 'resolved')).toBe(true)
  })
})

describe('Configuración y sincronización', () => {
  it('las reglas son configurables (ALERT_RULES_JSON) y se pueden consultar', async () => {
    const { api, ctx } = setup({ ALERT_RULES_JSON: JSON.stringify({ pvtLapses: { minLapses: 2 }, sleepinessHigh: { enabled: false } }) })
    expect(ctx.services.alertService.rules.pvtLapses).toEqual({ ...DEMO_ALERT_RULES.pvtLapses, minLapses: 2 })
    await api.post('/api/vigilance-tests').send(withLapses(2)).expect(201)
    expect(alertsOf(ctx, 'demo.pvt.lapses')).toHaveLength(1)
    await api.post('/api/check-ins').send(checkIn({ sleepiness: 9 })).expect(201)
    expect(alertsOf(ctx, 'demo.sleepiness.self_report')).toHaveLength(0)
    const rules = await api.get('/api/dev/alerts/rules').expect(200)
    expect(rules.body.data.pvtLapses.minLapses).toBe(2)
    expect(resolveRules().pvtLapses.minLapses).toBe(5)
  })

  it('las alertas llegan a Tierra; un reintento tras perder el acuse no las duplica', async () => {
    const { api, ctx, ground, clock } = setup()
    await ctx.worker.flush() // primero se entrega la tripulación inicial
    await api.post('/api/vigilance-tests').send(withLapses(6)).expect(201)
    // Tierra procesa la alerta, pero su acuse se pierde: la nave la reenvía.
    ground.passNext() // la prueba PVT
    ground.loseNextAck(Object.assign(new Error('acuse perdido'), { code: 'TIMEOUT', retryable: true }))
    for (let i = 0; i < 5 && ctx.queue.list().some((e) => e.status !== 'acknowledged'); i++) {
      await ctx.worker.flush()
      clock.advance(5000)
    }
    const alertId = ctx.queue.list().find((e) => e.entityType === 'alert').id
    expect(ground.received.filter((e) => e.id === alertId).length).toBeGreaterThan(1) // hubo reenvío
    expect([...ground.stored.values()].filter((e) => e.entityType === 'alert')).toHaveLength(1) // aplicado una vez
    expect(ctx.queue.list().every((e) => e.status === 'acknowledged')).toBe(true)
  })
})

describe('Alertas con el enlace desconectado y reconectado', () => {
  it('se acumulan en la cola, llegan tras reconectar una sola vez cada versión y la alerta abierta sigue siendo única', async () => {
    const { api, ctx, ground, clock } = setup()
    await ctx.worker.flush() // tripulación inicial
    ctx.link.setState('disconnected')

    await api.post('/api/vigilance-tests').send(withLapses(6)).expect(201)
    await api.post('/api/vigilance-tests').send(withLapses(7)).expect(201) // misma regla → actualiza la alerta
    await api.post('/api/check-ins').send(checkIn({ sleepiness: 8 })).expect(201)
    await ctx.worker.flush() // sin enlace: nada sale
    expect(ground.received.filter((e) => e.entityType === 'alert')).toHaveLength(0)

    const lapses = alertsOf(ctx, 'demo.pvt.lapses')
    expect(lapses).toHaveLength(1)
    const alertEvents = ctx.queue.list().filter((e) => e.entityType === 'alert')
    // enlace interrumpido + lapsos (create + update) + somnolencia
    expect(alertEvents.map((e) => [e.payload.rule?.id ?? 'link', e.operation])).toEqual([
      ['link', 'create'],
      ['demo.pvt.lapses', 'create'],
      ['demo.pvt.lapses', 'update'],
      ['demo.sleepiness.self_report', 'create'],
    ])

    ctx.link.setState('connected') // resuelve la alerta de enlace y dispara el reenvío
    ground.loseNextAck(Object.assign(new Error('acuse perdido'), { code: 'TIMEOUT', retryable: true }))
    for (let i = 0; i < 6 && ctx.queue.list().some((e) => e.status !== 'acknowledged'); i++) {
      await ctx.worker.flush()
      clock.advance(5000)
    }
    expect(ctx.queue.list().every((e) => e.status === 'acknowledged')).toBe(true)

    // Tierra aplica cada evento una vez; para la alerta de lapsos, su última versión lleva toda la evidencia.
    const storedAlerts = [...ground.stored.values()].filter((e) => e.entityType === 'alert')
    expect(new Set(storedAlerts.map((e) => e.id)).size).toBe(storedAlerts.length)
    const lapseVersions = storedAlerts.filter((e) => e.entityId === lapses[0].id)
    expect(lapseVersions.map((e) => e.operation)).toEqual(['create', 'update'])
    expect(lapseVersions.at(-1).payload.evidence).toHaveLength(2)
    expect(storedAlerts.find((e) => e.payload.category === 'communication' && e.operation === 'update').payload.status).toBe('resolved')
  })
})
