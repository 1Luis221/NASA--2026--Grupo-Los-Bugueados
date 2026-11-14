import { z } from 'zod'
import { check, defineSchemas, idSchema, isNotBefore, textSchema, timestampSchema } from './common.js'
import { CREW_ROLES, CREW_STATUSES } from './enums.js'

/**
 * Miembro de la tripulación. Solo datos operativos: no incluye
 * información médica ni personal sensible.
 */
export const [CrewMemberSchema, CrewMemberStrictSchema] = defineSchemas(({ object }) =>
  object({
    id: idSchema,
    name: textSchema(100),
    callsign: textSchema(30).optional(),
    role: z.enum(CREW_ROLES),
    agency: textSchema(50).optional(),
    status: z.enum(CREW_STATUSES),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  }).superRefine((crew, ctx) => {
    check(ctx, isNotBefore(crew.updatedAt, crew.createdAt), ['updatedAt'], 'updatedAt no puede ser anterior a createdAt')
  }),
)
