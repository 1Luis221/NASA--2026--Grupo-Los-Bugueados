import { z } from 'zod'
import { check, defineSchemas, idSchema, isNotBefore, textSchema, timestampSchema } from './common.js'
import { ALERT_CATEGORIES, ALERT_SEVERITIES, ALERT_STATUSES, SYNC_ENTITY_TYPES, SYSTEM_NODES } from './enums.js'

/**
 * Alerta operativa. La severidad indica prioridad de atención, no un
 * diagnóstico. `crewMemberId` es opcional para alertas de sistema o de
 * comunicaciones que no afectan a un tripulante concreto.
 */
export const [AlertSchema, AlertStrictSchema] = defineSchemas(({ object }) =>
  object({
    id: idSchema,
    crewMemberId: idSchema.optional(),
    origin: z.enum(SYSTEM_NODES),
    category: z.enum(ALERT_CATEGORIES),
    severity: z.enum(ALERT_SEVERITIES),
    status: z.enum(ALERT_STATUSES),
    title: textSchema(120),
    message: textSchema(500).optional(),
    /** Registro que motivó la alerta (p. ej. una lectura de constantes). */
    relatedRecord: object({ entityType: z.enum(SYNC_ENTITY_TYPES), id: idSchema }).optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    acknowledgedAt: timestampSchema.optional(),
    acknowledgedBy: textSchema(100).optional(),
    resolvedAt: timestampSchema.optional(),
  }).superRefine((alert, ctx) => {
    const { status, createdAt, updatedAt, acknowledgedAt, resolvedAt } = alert

    check(ctx, isNotBefore(updatedAt, createdAt), ['updatedAt'], 'updatedAt no puede ser anterior a createdAt')

    if (status === 'acknowledged') {
      check(ctx, acknowledgedAt !== undefined, ['acknowledgedAt'], 'Una alerta reconocida requiere acknowledgedAt')
    }
    if (status === 'resolved') {
      check(ctx, resolvedAt !== undefined, ['resolvedAt'], 'Una alerta resuelta requiere resolvedAt')
    }
    if (status === 'active') {
      check(ctx, acknowledgedAt === undefined && resolvedAt === undefined, ['status'], 'Una alerta activa no puede estar reconocida ni resuelta')
    }
    if (acknowledgedAt) {
      check(ctx, isNotBefore(acknowledgedAt, createdAt), ['acknowledgedAt'], 'acknowledgedAt no puede ser anterior a createdAt')
    }
    if (resolvedAt) {
      check(ctx, isNotBefore(resolvedAt, acknowledgedAt ?? createdAt), ['resolvedAt'], 'resolvedAt no puede ser anterior al reconocimiento ni a la creación')
    }
  }),
)
