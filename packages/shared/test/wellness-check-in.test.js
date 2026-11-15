import { describe, it } from 'vitest'
import { exampleWellnessCheckIn } from '../src/examples.js'
import { WellnessCheckInSchema } from '../src/schemas/wellness-check-in.js'
import { expectInvalid, expectValid, variant } from './helpers.js'

describe('WellnessCheckInSchema', () => {
  it('acepta el ejemplo documentado', () => {
    expectValid(WellnessCheckInSchema, exampleWellnessCheckIn)
  })

  it('acepta sin campos opcionales', () => {
    expectValid(WellnessCheckInSchema, variant(exampleWellnessCheckIn, (c) => {
      delete c.sleepDuration
      delete c.notes
    }))
  })

  it.each(['mood', 'stress', 'fatigue', 'sleepQuality'])('rechaza %s fuera de la escala 1–5 o decimal', (key) => {
    for (const value of [0, 6, 2.5]) {
      expectInvalid(WellnessCheckInSchema, variant(exampleWellnessCheckIn, (c) => { c[key] = value }), [key])
    }
  })

  it('exige que el origen sea una autoevaluación', () => {
    expectInvalid(WellnessCheckInSchema, variant(exampleWellnessCheckIn, (c) => { c.source.type = 'sensor' }), ['source', 'type'])
  })

  it('rechaza duración de sueño imposible', () => {
    expectInvalid(WellnessCheckInSchema, variant(exampleWellnessCheckIn, (c) => { c.sleepDuration.value = 25 }), ['sleepDuration', 'value'])
  })

  it('rechaza notas de más de 500 caracteres', () => {
    expectInvalid(WellnessCheckInSchema, variant(exampleWellnessCheckIn, (c) => { c.notes = 'x'.repeat(501) }), ['notes'])
  })
})

describe('WellnessCheckInSchema · somnolencia (KSS)', () => {
  it('acepta somnolencia KSS entera 1–9 (opcional) y rechaza valores fuera de escala', () => {
    expectValid(WellnessCheckInSchema, variant(exampleWellnessCheckIn, (c) => { c.sleepiness = 1 }))
    expectValid(WellnessCheckInSchema, variant(exampleWellnessCheckIn, (c) => { c.sleepiness = 9 }))
    expectInvalid(WellnessCheckInSchema, variant(exampleWellnessCheckIn, (c) => { c.sleepiness = 10 }), ['sleepiness'])
    expectInvalid(WellnessCheckInSchema, variant(exampleWellnessCheckIn, (c) => { c.sleepiness = 6.5 }), ['sleepiness'])
  })
})
