import { z } from 'zod'
import { check, dataSourceSchema, defineSchemas, idSchema, measurementSchema, textSchema, timestampSchema } from './common.js'
import { UNITS } from './enums.js'

/** Duración máxima de la ventana de análisis agregada (1 hora). */
export const CAMERA_MAX_WINDOW_SECONDS = 3600

const METRIC_KEYS = Object.freeze(['blinkRate', 'eyeClosureRatio', 'yawnCount', 'headPose'])

/**
 * Métricas derivadas del análisis de cámara sobre una ventana de tiempo
 * que termina en `recordedAt`. Por privacidad, nunca contiene imágenes
 * ni landmarks en bruto: solo indicadores agregados.
 */
export const [CameraMetricsSchema, CameraMetricsStrictSchema] = defineSchemas(({ object }) => {
  const angle = measurementSchema(UNITS.DEGREES, { min: -180, max: 180 }, object)

  return object({
    id: idSchema,
    crewMemberId: idSchema,
    recordedAt: timestampSchema,
    source: dataSourceSchema('camera', object),
    windowDuration: measurementSchema(UNITS.SECONDS, { min: 1, max: CAMERA_MAX_WINDOW_SECONDS }, object),
    faceDetected: z.boolean(),
    /** Confianza del modelo de visión en la ventana (0–1). */
    confidence: z.number().min(0).max(1).optional(),
    model: object({ name: textSchema(60), version: textSchema(30) }).optional(),
    blinkRate: measurementSchema(UNITS.BLINKS_PER_MIN, { min: 0, max: 120 }, object).optional(),
    /** Fracción de la ventana con los ojos cerrados (tipo PERCLOS), 0–1. */
    eyeClosureRatio: measurementSchema(UNITS.RATIO, { min: 0, max: 1 }, object).optional(),
    yawnCount: measurementSchema(UNITS.COUNT, { min: 0, max: 1000, integer: true }, object).optional(),
    headPose: object({ pitch: angle, yaw: angle, roll: angle }).optional(),
  }).superRefine((metrics, ctx) => {
    const hasMetrics = METRIC_KEYS.some((key) => metrics[key] !== undefined)
    if (metrics.faceDetected) {
      check(ctx, hasMetrics, [], 'Con faceDetected=true se requiere al menos una métrica')
    } else {
      check(ctx, !hasMetrics, [], 'Con faceDetected=false no puede haber métricas faciales')
    }
  })
})
