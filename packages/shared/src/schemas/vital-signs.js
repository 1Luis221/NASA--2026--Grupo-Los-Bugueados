import { z } from 'zod'
import { check, dataSourceSchema, defineSchemas, idSchema, measurementSchema, timestampSchema } from './common.js'
import { UNITS } from './enums.js'

/**
 * Límites de plausibilidad física de las constantes vitales.
 * Sirven SOLO para rechazar lecturas imposibles o corruptas (errores de
 * sensor, unidades equivocadas). NO son rangos de normalidad clínica ni
 * deben usarse para generar alertas.
 */
export const VITAL_SIGNS_PLAUSIBILITY = Object.freeze({
  heartRate: { min: 20, max: 300, unit: UNITS.BPM },
  respiratoryRate: { min: 0, max: 100, unit: UNITS.BREATHS_PER_MIN },
  oxygenSaturation: { min: 0, max: 100, unit: UNITS.PERCENT },
  bodyTemperature: { min: 20, max: 45, unit: UNITS.CELSIUS },
  systolic: { min: 40, max: 300, unit: UNITS.MMHG },
  diastolic: { min: 10, max: 200, unit: UNITS.MMHG },
  heartRateVariability: { min: 0, max: 1000, unit: UNITS.MILLISECONDS },
})

const P = VITAL_SIGNS_PLAUSIBILITY

const MEASUREMENT_KEYS = Object.freeze([
  'heartRate',
  'respiratoryRate',
  'oxygenSaturation',
  'bodyTemperature',
  'bloodPressure',
  'heartRateVariability',
])

/**
 * Lectura de constantes vitales de un tripulante en un instante.
 * Todas las mediciones son opcionales (no todos los sensores las aportan),
 * pero se exige al menos una.
 */
export const [VitalSignsSchema, VitalSignsStrictSchema] = defineSchemas(({ object }) => {
  const measure = (key) => measurementSchema(P[key].unit, P[key], object)

  const bloodPressure = object({
    systolic: z.number().min(P.systolic.min).max(P.systolic.max),
    diastolic: z.number().min(P.diastolic.min).max(P.diastolic.max),
    unit: z.literal(UNITS.MMHG),
  }).refine((bp) => bp.systolic > bp.diastolic, {
    path: ['systolic'],
    message: 'La presión sistólica debe ser mayor que la diastólica',
  })

  return object({
    id: idSchema,
    crewMemberId: idSchema,
    recordedAt: timestampSchema,
    source: dataSourceSchema('sensor', object),
    heartRate: measure('heartRate').optional(),
    respiratoryRate: measure('respiratoryRate').optional(),
    oxygenSaturation: measure('oxygenSaturation').optional(),
    bodyTemperature: measure('bodyTemperature').optional(),
    bloodPressure: bloodPressure.optional(),
    heartRateVariability: measure('heartRateVariability').optional(),
  }).superRefine((vitals, ctx) => {
    check(ctx, MEASUREMENT_KEYS.some((key) => vitals[key] !== undefined), [], 'Se requiere al menos una medición')
  })
})
