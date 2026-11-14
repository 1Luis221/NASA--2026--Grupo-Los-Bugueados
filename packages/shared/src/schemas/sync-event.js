import { z } from 'zod'
import { AlertSchema, AlertStrictSchema } from './alert.js'
import { CameraMetricsSchema, CameraMetricsStrictSchema } from './camera-metrics.js'
import { check, defineSchemas, errorInfoSchema, idSchema, isNotBefore, timestampSchema } from './common.js'
import { CrewMemberSchema, CrewMemberStrictSchema } from './crew-member.js'
import { SYNC_ACK_RESULTS, SYNC_ENTITY_TYPES, SYNC_OPERATIONS, SYNC_STATUSES, SYSTEM_NODES } from './enums.js'
import { VitalSignsSchema, VitalSignsStrictSchema } from './vital-signs.js'
import { WellnessCheckInSchema, WellnessCheckInStrictSchema } from './wellness-check-in.js'

/** Esquema que debe cumplir el payload según el tipo de entidad y el modo. */
export const SYNC_PAYLOAD_SCHEMAS = Object.freeze({
  tolerant: Object.freeze({
    crew_member: CrewMemberSchema,
    vital_signs: VitalSignsSchema,
    wellness_check_in: WellnessCheckInSchema,
    camera_metrics: CameraMetricsSchema,
    alert: AlertSchema,
  }),
  strict: Object.freeze({
    crew_member: CrewMemberStrictSchema,
    vital_signs: VitalSignsStrictSchema,
    wellness_check_in: WellnessCheckInStrictSchema,
    camera_metrics: CameraMetricsStrictSchema,
    alert: AlertStrictSchema,
  }),
})

/** Máximo de reintentos configurable por evento. */
export const SYNC_MAX_ATTEMPTS_LIMIT = 100

/**
 * Unidad de sincronización nave ↔ tierra (cola store-and-forward).
 *
 * Idempotencia: `id` es la CLAVE DE IDEMPOTENCIA. Se genera una sola vez al
 * encolar el evento y no cambia entre reintentos; el receptor registra los
 * `id` ya procesados y responde `duplicate` en lugar de reaplicarlos.
 * `(origin, sequence)` también es único: `sequence` es monótono por nodo de
 * origen y permite ordenar y detectar huecos.
 *
 * Las interrupciones del enlace se modelan con intentos, último error y
 * próximo reintento. Este esquema solo define el contrato: el transporte y
 * la política de reintentos se implementan en las APIs.
 */
export const [SyncEventSchema, SyncEventStrictSchema] = defineSchemas(({ object, strict }) => {
  const payloadSchemas = SYNC_PAYLOAD_SCHEMAS[strict ? 'strict' : 'tolerant']

  return object({
    id: idSchema,
    sequence: z.int().min(0),
    origin: z.enum(SYSTEM_NODES),
    destination: z.enum(SYSTEM_NODES),
    entityType: z.enum(SYNC_ENTITY_TYPES),
    entityId: idSchema,
    operation: z.enum(SYNC_OPERATIONS),
    payload: z.record(z.string(), z.unknown()),
    status: z.enum(SYNC_STATUSES),
    attempts: z.int().min(0),
    maxAttempts: z.int().min(1).max(SYNC_MAX_ATTEMPTS_LIMIT),
    lastAttemptAt: timestampSchema.optional(),
    nextRetryAt: timestampSchema.optional(),
    lastError: errorInfoSchema(object).optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    acknowledgedAt: timestampSchema.optional(),
  }).transform((event, ctx) => {
    const { status, attempts, maxAttempts } = event

    check(ctx, event.origin !== event.destination, ['destination'], 'origin y destination deben ser nodos distintos')
    check(ctx, attempts <= maxAttempts, ['attempts'], 'attempts no puede superar maxAttempts')
    check(ctx, isNotBefore(event.updatedAt, event.createdAt), ['updatedAt'], 'updatedAt no puede ser anterior a createdAt')

    if (status === 'sending') {
      check(ctx, attempts >= 1 && event.lastAttemptAt !== undefined, ['lastAttemptAt'], 'Un envío en curso requiere attempts >= 1 y lastAttemptAt')
    }
    if (status === 'retry_scheduled') {
      check(ctx, event.nextRetryAt !== undefined, ['nextRetryAt'], 'Un reintento programado requiere nextRetryAt')
      check(ctx, event.lastError !== undefined, ['lastError'], 'Un reintento programado requiere lastError')
      check(ctx, attempts >= 1 && attempts < maxAttempts, ['attempts'], 'Un reintento requiere 1 <= attempts < maxAttempts')
      if (event.nextRetryAt && event.lastAttemptAt) {
        check(ctx, isNotBefore(event.nextRetryAt, event.lastAttemptAt), ['nextRetryAt'], 'nextRetryAt no puede ser anterior a lastAttemptAt')
      }
    }
    if (status === 'failed') {
      check(ctx, event.lastError !== undefined, ['lastError'], 'Un evento fallido requiere lastError')
    }
    if (status === 'acknowledged') {
      check(ctx, event.acknowledgedAt !== undefined, ['acknowledgedAt'], 'Un evento confirmado requiere acknowledgedAt')
    }

    // El payload debe ser una entidad válida del tipo declarado y coincidir con entityId.
    // Se devuelve el payload ya parseado (en modo tolerante, sin campos desconocidos).
    const result = payloadSchemas[event.entityType].safeParse(event.payload)
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.issues.push({ ...issue, path: ['payload', ...issue.path], input: event.payload })
      }
      return event
    }
    check(ctx, result.data.id === event.entityId, ['entityId'], 'entityId debe coincidir con payload.id')
    return { ...event, payload: result.data }
  })
})

/**
 * Acuse de recibo de un SyncEvent, enviado por el receptor al emisor.
 * `eventId` referencia SyncEvent.id (clave de idempotencia).
 */
export const [SyncAckSchema, SyncAckStrictSchema] = defineSchemas(({ object }) =>
  object({
    eventId: idSchema,
    sequence: z.int().min(0),
    /** Nodo que envía el acuse (el receptor del SyncEvent). */
    origin: z.enum(SYSTEM_NODES),
    destination: z.enum(SYSTEM_NODES),
    result: z.enum(SYNC_ACK_RESULTS),
    receivedAt: timestampSchema,
    error: errorInfoSchema(object).optional(),
  }).superRefine((ack, ctx) => {
    check(ctx, ack.origin !== ack.destination, ['destination'], 'origin y destination deben ser nodos distintos')
    if (ack.result === 'rejected') {
      check(ctx, ack.error !== undefined, ['error'], 'Un acuse rechazado requiere error')
    } else {
      check(ctx, ack.error === undefined, ['error'], 'Solo un acuse rechazado puede incluir error')
    }
  }),
)
