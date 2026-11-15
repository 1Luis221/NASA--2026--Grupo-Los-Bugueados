import { z } from 'zod'
import { check, defineSchemas, idSchema, isNotBefore, textSchema, timestampSchema } from './common.js'
import { ALERT_CATEGORIES, ALERT_SEVERITIES, ALERT_STATUSES, DATA_SOURCE_TYPES, SYNC_ENTITY_TYPES, SYSTEM_NODES } from './enums.js'

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
    /**
     * Regla que generó la alerta. `demonstrative: true` = regla operativa de
     * demostración, configurable y sin validación clínica.
     */
    rule: object({
      id: z.string().regex(/^[a-z0-9_.-]{1,60}$/),
      name: textSchema(120),
      demonstrative: z.boolean(),
      /** Parámetros con los que se evaluó (umbrales de la demo, tamaño de línea base…). */
      parameters: z.record(z.string().max(40), z.union([z.number(), z.string().max(60), z.boolean()])).optional(),
    }).optional(),
    /** Registros que sustentan la alerta, con su procedencia y momento. */
    evidence: z
      .array(
        object({
          entityType: z.enum(SYNC_ENTITY_TYPES),
          id: idSchema,
          recordedAt: timestampSchema,
          source: object({ type: z.enum(DATA_SOURCE_TYPES), simulated: z.boolean() }),
          summary: textSchema(200),
        }),
      )
      .max(20)
      .optional(),
    /** Clave de deduplicación: como máximo una alerta abierta por clave. */
    dedupKey: z.string().min(1).max(200).optional(),
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
