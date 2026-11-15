import { describe, expect, it } from 'vitest'
import { exampleAlert } from '../src/examples.js'
import { AlertSchema } from '../src/schemas/alert.js'
import { ALERT_STATUSES } from '../src/schemas/enums.js'
import { ALERT_STATUS_TRANSITIONS, canTransitionAlertStatus } from '../src/schemas/transitions.js'
import { expectInvalid, expectValid, variant } from './helpers.js'

const activeAlert = variant(exampleAlert, (a) => {
  a.status = 'active'
  delete a.acknowledgedAt
  delete a.acknowledgedBy
})

describe('AlertSchema', () => {
  it('acepta el ejemplo documentado (reconocida)', () => {
    expectValid(AlertSchema, exampleAlert)
  })

  it('acepta una alerta activa', () => {
    expectValid(AlertSchema, activeAlert)
  })

  it('acepta una alerta resuelta', () => {
    expectValid(AlertSchema, variant(exampleAlert, (a) => {
      a.status = 'resolved'
      a.resolvedAt = '2026-11-14T08:00:00.000Z'
      a.updatedAt = a.resolvedAt
    }))
  })

  it('acepta alertas de sistema sin tripulante asociado', () => {
    expectValid(AlertSchema, variant(activeAlert, (a) => {
      delete a.crewMemberId
      delete a.relatedRecord
      a.category = 'communication'
      a.origin = 'ground'
    }))
  })

  it.each([
    ['severity', 'urgent'],
    ['status', 'closed'],
    ['category', 'medical'],
    ['origin', 'mars'],
  ])('rechaza %s=%j', (key, value) => {
    expectInvalid(AlertSchema, variant(exampleAlert, (a) => { a[key] = value }), [key])
  })

  it('exige acknowledgedAt en alertas reconocidas', () => {
    expectInvalid(AlertSchema, variant(exampleAlert, (a) => { delete a.acknowledgedAt }), ['acknowledgedAt'])
  })

  it('exige resolvedAt en alertas resueltas', () => {
    expectInvalid(AlertSchema, variant(exampleAlert, (a) => { a.status = 'resolved' }), ['resolvedAt'])
  })

  it('rechaza una alerta activa con marcas de reconocimiento', () => {
    expectInvalid(AlertSchema, variant(exampleAlert, (a) => { a.status = 'active' }), ['status'])
  })

  it('rechaza resolución anterior al reconocimiento', () => {
    expectInvalid(AlertSchema, variant(exampleAlert, (a) => {
      a.status = 'resolved'
      a.resolvedAt = '2026-11-14T07:40:00.000Z'
    }), ['resolvedAt'])
  })
})

describe('transiciones de estado de alertas', () => {
  it.each([
    ['active', 'acknowledged', true],
    ['active', 'resolved', true],
    ['acknowledged', 'resolved', true],
    ['acknowledged', 'active', false],
    ['resolved', 'active', false],
    ['active', 'active', false],
    ['unknown', 'resolved', false],
  ])('%s → %s = %s', (from, to, allowed) => {
    expect(canTransitionAlertStatus(from, to)).toBe(allowed)
  })

  it('define transiciones para todos los estados', () => {
    expect(Object.keys(ALERT_STATUS_TRANSITIONS).sort()).toEqual([...ALERT_STATUSES].sort())
  })
})

describe('AlertSchema · regla, evidencia y deduplicación', () => {
  const withRule = (a) => {
    a.category = 'cognitive'
    a.rule = { id: 'demo.pvt.lapses', name: 'Lapsos (regla demostrativa)', demonstrative: true, parameters: { minLapses: 5, scale: 'PVT-B' } }
    a.evidence = [{ entityType: 'vigilance_test', id: crypto.randomUUID(), recordedAt: '2026-11-14T07:00:00.000Z', source: { type: 'cognitive_test', simulated: false }, summary: 'PVT-B: 6 lapsos' }]
    a.dedupKey = 'demo.pvt.lapses:abc'
  }

  it('acepta regla demostrativa, evidencia con procedencia y clave de deduplicación', () => {
    expectValid(AlertSchema, variant(exampleAlert, withRule))
    expectValid(AlertSchema, variant(exampleAlert, (a) => { a.category = 'data_quality' }))
  })

  it('rechaza identificadores de regla inválidos, evidencia sin procedencia y más de 20 evidencias', () => {
    expectInvalid(AlertSchema, variant(exampleAlert, (a) => { withRule(a); a.rule.id = 'Regla Con Espacios' }), ['rule', 'id'])
    expectInvalid(AlertSchema, variant(exampleAlert, (a) => { withRule(a); delete a.evidence[0].source }), ['evidence', 0, 'source'])
    expectInvalid(AlertSchema, variant(exampleAlert, (a) => { withRule(a); a.evidence = Array(21).fill(a.evidence[0]) }), ['evidence'])
  })
})
