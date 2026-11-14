import { z } from 'zod'
import { ALERT_SEVERITIES, ALERT_STATUSES, idSchema } from '@astronaut-wellness/shared'

/** Parámetros de consulta (DTO de la API, no entidades de dominio). */
const limit = z.coerce.number().int().min(1).max(500).default(50)

export const RecordsQuerySchema = z.object({ crewMemberId: idSchema.optional(), limit })

export const AlertsQuerySchema = z.object({
  status: z.enum(ALERT_STATUSES).optional(),
  severity: z.enum(ALERT_SEVERITIES).optional(),
  limit,
})

export const LimitQuerySchema = z.object({ limit })
