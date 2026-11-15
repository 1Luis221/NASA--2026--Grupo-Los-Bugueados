import { z } from 'zod'
import {
  ALERT_CATEGORIES,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  LINK_STATES,
  SYNC_STATUSES,
  idSchema,
} from '@astronaut-wellness/shared'

/** Parámetros de consulta y cuerpos de control (DTO de la API, no entidades de dominio). */
const limit = z.coerce.number().int().min(1).max(500).default(50)

export const RecordsQuerySchema = z.object({ crewMemberId: idSchema.optional(), limit })

export const AlertsQuerySchema = z.object({
  status: z.enum(ALERT_STATUSES).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  category: z.enum(ALERT_CATEGORIES).optional(),
  crewMemberId: idSchema.optional(),
  limit,
})

export const SyncEventsQuerySchema = z.object({ status: z.enum(SYNC_STATUSES).optional(), limit })

export const LinkUpdateSchema = z
  .strictObject({
    state: z.enum(LINK_STATES).optional(),
    latencyMs: z.int().min(0).max(60_000).optional(),
    degradedLatencyMs: z.int().min(0).max(60_000).optional(),
    degradedFailureRate: z.number().min(0).max(1).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Indica al menos un cambio' })

export const InjectFailuresSchema = z.strictObject({ count: z.int().min(1).max(100) })
