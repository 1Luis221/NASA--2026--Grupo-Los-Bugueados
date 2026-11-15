import { describe, expect, it } from 'vitest'
import { exampleSyncEvent, exampleVigilanceTest } from '../src/examples.js'
import { SyncEventSchema } from '../src/schemas/sync-event.js'
import {
  PVT_DEFAULT_PROTOCOL,
  VigilanceTestSchema,
  VigilanceTestStrictSchema,
  classifyPvtTrial,
  summarizePvtTrials,
} from '../src/schemas/vigilance-test.js'
import { expectInvalid, expectValid, variant } from './helpers.js'

const P = PVT_DEFAULT_PROTOCOL

describe('classifyPvtTrial (definiciones del protocolo PVT-B)', () => {
  it.each([
    [{ stimulusOffsetMs: null, reactionTimeMs: null }, 'false_start'],
    [{ stimulusOffsetMs: 1000, reactionTimeMs: null }, 'timeout'],
    [{ stimulusOffsetMs: 1000, reactionTimeMs: 99 }, 'false_start'],
    [{ stimulusOffsetMs: 1000, reactionTimeMs: 100 }, 'valid'],
    [{ stimulusOffsetMs: 1000, reactionTimeMs: 354 }, 'valid'],
    [{ stimulusOffsetMs: 1000, reactionTimeMs: 355 }, 'lapse'],
  ])('%j → %s', (trial, outcome) => {
    expect(classifyPvtTrial(trial, P)).toBe(outcome)
  })
})

describe('summarizePvtTrials', () => {
  it('cuenta resultados y calcula estadísticas solo con respuestas a estímulos', () => {
    expect(exampleVigilanceTest.summary).toEqual({
      trialCount: 6,
      validCount: 2,
      lapseCount: 1,
      falseStartCount: 2,
      timeoutCount: 1,
      errorCount: 3,
      meanReactionTimeMs: 345.7, // (245 + 280 + 512) / 3
      medianReactionTimeMs: 280,
      fastest10PercentMeanMs: 245,
      slowest10PercentMeanMs: 512,
    })
  })

  it('sin respuestas válidas, las estadísticas son null (no 0)', () => {
    const summary = summarizePvtTrials([{ index: 0, stimulusOffsetMs: 1000, reactionTimeMs: null }], P)
    expect(summary).toMatchObject({ timeoutCount: 1, meanReactionTimeMs: null, medianReactionTimeMs: null })
  })
})

describe('VigilanceTestSchema', () => {
  it('acepta el ejemplo en modo tolerante y estricto', () => {
    expectValid(VigilanceTestSchema, exampleVigilanceTest)
    expectValid(VigilanceTestStrictSchema, exampleVigilanceTest)
  })

  it('rechaza un resumen que no coincide con los ensayos (resultados verificables)', () => {
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.summary.lapseCount = 0 }), ['summary', 'lapseCount'])
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.summary.meanReactionTimeMs = 300 }), ['summary', 'meanReactionTimeMs'])
  })

  it('rechaza una clasificación incoherente con el protocolo', () => {
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.trials[3].outcome = 'valid' }), ['trials', 3, 'outcome'])
  })

  it('rechaza índices no consecutivos, RT sin estímulo y RT por encima del tiempo máximo', () => {
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.trials[1].index = 7 }), ['trials', 1, 'index'])
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.trials[2].reactionTimeMs = 50 }), ['trials', 2, 'reactionTimeMs'])
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.trials[0].reactionTimeMs = 4000 }), ['trials', 0, 'reactionTimeMs'])
  })

  it('admite estímulos durante toda la prueba (más allá de 60 s) pero no después de su final', () => {
    expectValid(VigilanceTestStrictSchema, variant(exampleVigilanceTest, (t) => { t.trials[0].stimulusOffsetMs = 175_000 }))
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.trials[0].stimulusOffsetMs = 180_001 }), ['trials', 0, 'stimulusOffsetMs'])
  })

  it('rechaza protocolos incoherentes', () => {
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.protocol.isiMaxMs = 500 }), ['protocol', 'isiMaxMs'])
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.protocol.lapseThresholdMs = 50 }), ['protocol', 'lapseThresholdMs'])
  })

  it('exige procedencia de prueba cognitiva', () => {
    expectInvalid(VigilanceTestSchema, variant(exampleVigilanceTest, (t) => { t.source.type = 'sensor' }), ['source', 'type'])
  })

  it('puede sincronizarse como SyncEvent (entityType vigilance_test)', () => {
    const event = { ...structuredClone(exampleSyncEvent), entityType: 'vigilance_test', entityId: exampleVigilanceTest.id, payload: structuredClone(exampleVigilanceTest) }
    expectValid(SyncEventSchema, event)
  })
})
