import { z } from 'zod'
import { dataSourceSchema, defineSchemas, idSchema, measurementSchema, textSchema, timestampSchema } from './common.js'
import { UNITS } from './enums.js'

/** Escala Likert entera de 1 a 5. */
export const LIKERT_MIN = 1
export const LIKERT_MAX = 5
const likert = z.int().min(LIKERT_MIN).max(LIKERT_MAX)

/**
 * Somnolencia autodeclarada en este momento con la Karolinska Sleepiness Scale
 * (KSS, Åkerstedt y Gillberg, 1990): 1 = extremadamente despierto … 9 =
 * extremadamente somnoliento, luchando contra el sueño. Es una percepción
 * subjetiva del estado actual, distinta de la fatiga (1–5) y no diagnóstica.
 */
export const KSS_MIN = 1
export const KSS_MAX = 9

/**
 * Autoevaluación subjetiva del tripulante. Escalas 1–5:
 * - mood, sleepQuality: 1 = muy malo … 5 = muy bueno
 * - stress, fatigue:    1 = muy bajo … 5 = muy alto
 * Son percepciones propias, no mediciones ni diagnósticos.
 */
export const [WellnessCheckInSchema, WellnessCheckInStrictSchema] = defineSchemas(({ object }) =>
  object({
    id: idSchema,
    crewMemberId: idSchema,
    recordedAt: timestampSchema,
    source: dataSourceSchema('self_report', object),
    mood: likert,
    stress: likert,
    fatigue: likert,
    sleepQuality: likert,
    sleepDuration: measurementSchema(UNITS.HOURS, { min: 0, max: 24 }, object).optional(),
    sleepiness: z.int().min(KSS_MIN).max(KSS_MAX).optional(),
    notes: textSchema(500).optional(),
  }),
)
