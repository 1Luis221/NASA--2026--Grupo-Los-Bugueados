import { z } from 'zod'
import { check, dataSourceSchema, defineSchemas, idSchema, timestampSchema } from './common.js'
import { PVT_OUTCOMES } from './enums.js'

/**
 * Protocolo por defecto: versión breve de la prueba de vigilancia psicomotora
 * (PVT-B, Basner et al., 2011): 3 min, intervalo entre estímulos 1–4 s, lapso
 * ≥ 355 ms, falsa salida < 100 ms. Son parámetros de MEDICIÓN de la prueba,
 * configurables; no son umbrales clínicos ni sirven para diagnosticar.
 */
export const PVT_DEFAULT_PROTOCOL = Object.freeze({
  name: 'PVT-B',
  durationSeconds: 180,
  isiMinMs: 1000,
  isiMaxMs: 4000,
  lapseThresholdMs: 355,
  falseStartThresholdMs: 100,
  responseTimeoutMs: 3000,
})

/** Tolerancia al comparar medias recalculadas (redondeo a 0,1 ms). */
const MS_TOLERANCE = 0.051

/**
 * Clasifica un ensayo según el protocolo. `stimulusOffsetMs` null = respuesta
 * anticipada sin estímulo; `reactionTimeMs` null = sin respuesta.
 */
export function classifyPvtTrial({ stimulusOffsetMs, reactionTimeMs }, protocol) {
  if (stimulusOffsetMs === null) return 'false_start'
  if (reactionTimeMs === null) return 'timeout'
  if (reactionTimeMs < protocol.falseStartThresholdMs) return 'false_start'
  if (reactionTimeMs >= protocol.lapseThresholdMs) return 'lapse'
  return 'valid'
}

const round1 = (value) => (value === null ? null : Math.round(value * 10) / 10)
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null)
function median(values) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * Resumen descriptivo de los ensayos (se recalcula en cada nodo para verificar).
 * Los tiempos de reacción del resumen incluyen las respuestas válidas y los
 * lapsos (respuestas a un estímulo, sin falsas salidas ni omisiones).
 */
export function summarizePvtTrials(trials, protocol) {
  const counts = Object.fromEntries(PVT_OUTCOMES.map((o) => [o, 0]))
  for (const trial of trials) counts[classifyPvtTrial(trial, protocol)] += 1

  const rts = trials
    .filter((t) => ['valid', 'lapse'].includes(classifyPvtTrial(t, protocol)))
    .map((t) => t.reactionTimeMs)
    .sort((a, b) => a - b)
  const tenth = Math.max(1, Math.ceil(rts.length * 0.1))

  return {
    trialCount: trials.length,
    validCount: counts.valid,
    lapseCount: counts.lapse,
    falseStartCount: counts.false_start,
    timeoutCount: counts.timeout,
    errorCount: counts.false_start + counts.timeout,
    meanReactionTimeMs: round1(mean(rts)),
    medianReactionTimeMs: round1(median(rts)),
    fastest10PercentMeanMs: rts.length ? round1(mean(rts.slice(0, tenth))) : null,
    slowest10PercentMeanMs: rts.length ? round1(mean(rts.slice(-tenth))) : null,
  }
}

const msOrNull = z.number().min(0).max(60_000).nullable()

/**
 * Resultado de una prueba de vigilancia psicomotora (PVT) realizada a bordo.
 * Incluye TODOS los ensayos: el esquema recalcula la clasificación de cada uno
 * y el resumen, y rechaza el registro si no coinciden (resultados verificables).
 */
export const [VigilanceTestSchema, VigilanceTestStrictSchema] = defineSchemas(({ object }) =>
  object({
    id: idSchema,
    crewMemberId: idSchema,
    recordedAt: timestampSchema,
    source: dataSourceSchema('cognitive_test', object),
    testType: z.literal('pvt'),
    protocol: object({
      name: z.string().trim().min(1).max(40),
      durationSeconds: z.int().min(10).max(1800),
      isiMinMs: z.int().min(100).max(60_000),
      isiMaxMs: z.int().min(100).max(60_000),
      lapseThresholdMs: z.int().min(100).max(10_000),
      falseStartThresholdMs: z.int().min(0).max(1000),
      responseTimeoutMs: z.int().min(500).max(60_000),
    }),
    trials: z
      .array(
        object({
          index: z.int().min(0),
          /** Momento del estímulo desde el inicio de la prueba; null si la respuesta llegó sin estímulo. */
          stimulusOffsetMs: z.number().min(0).max(1_800_000).nullable(),
          /** Tiempo de reacción desde el estímulo; null si no hubo respuesta o no hubo estímulo. */
          reactionTimeMs: msOrNull,
          outcome: z.enum(PVT_OUTCOMES),
        }),
      )
      .min(1)
      .max(1000),
    summary: object({
      trialCount: z.int().min(0),
      validCount: z.int().min(0),
      lapseCount: z.int().min(0),
      falseStartCount: z.int().min(0),
      timeoutCount: z.int().min(0),
      errorCount: z.int().min(0),
      meanReactionTimeMs: msOrNull,
      medianReactionTimeMs: msOrNull,
      fastest10PercentMeanMs: msOrNull,
      slowest10PercentMeanMs: msOrNull,
    }),
  }).superRefine((test, ctx) => {
    const { protocol, trials, summary } = test
    check(ctx, protocol.isiMinMs <= protocol.isiMaxMs, ['protocol', 'isiMaxMs'], 'isiMaxMs debe ser ≥ isiMinMs')
    check(ctx, protocol.falseStartThresholdMs < protocol.lapseThresholdMs, ['protocol', 'lapseThresholdMs'], 'El umbral de lapso debe superar al de falsa salida')
    check(ctx, protocol.lapseThresholdMs <= protocol.responseTimeoutMs, ['protocol', 'responseTimeoutMs'], 'El tiempo máximo debe ser ≥ umbral de lapso')

    trials.forEach((trial, i) => {
      check(ctx, trial.index === i, ['trials', i, 'index'], 'Los índices deben ser consecutivos desde 0')
      check(ctx, trial.stimulusOffsetMs !== null || trial.reactionTimeMs === null, ['trials', i, 'reactionTimeMs'], 'Sin estímulo no puede haber tiempo de reacción')
      check(ctx, trial.stimulusOffsetMs === null || trial.stimulusOffsetMs <= protocol.durationSeconds * 1000, ['trials', i, 'stimulusOffsetMs'], 'Estímulo posterior al final de la prueba')
      check(ctx, trial.reactionTimeMs === null || trial.reactionTimeMs <= protocol.responseTimeoutMs, ['trials', i, 'reactionTimeMs'], 'Supera el tiempo máximo de respuesta')
      check(ctx, trial.outcome === classifyPvtTrial(trial, protocol), ['trials', i, 'outcome'], 'La clasificación no corresponde al protocolo')
    })

    const expected = summarizePvtTrials(trials, protocol)
    for (const [key, value] of Object.entries(expected)) {
      const actual = summary[key]
      const matches =
        value === null || actual === null ? value === actual : Math.abs(value - actual) <= (Number.isInteger(value) ? 0 : MS_TOLERANCE)
      check(ctx, matches, ['summary', key], `No coincide con lo recalculado a partir de los ensayos (${value})`)
    }
  }),
)
