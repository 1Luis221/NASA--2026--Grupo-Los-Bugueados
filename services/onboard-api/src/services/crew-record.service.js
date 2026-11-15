import { idSchema } from '@astronaut-wellness/shared'
import { formatIssues } from '../middleware/validate.js'
import { HttpError } from '../middleware/errors.js'

/** Campos que pone siempre el servidor: no se aceptan del cliente. */
export const SERVER_FIELDS = Object.freeze(['id', 'recordedAt', 'source'])

/**
 * Registros de un tripulante creados a bordo por la interfaz (métricas de cámara,
 * pruebas cognitivas…). El servidor añade id, recordedAt y source, valida el
 * registro completo con el esquema ESTRICTO del contrato, lo guarda y lo encola
 * para Tierra.
 *
 * Se valida el registro completo (y no un `.omit()` del esquema) porque los
 * contratos con refinamientos no admiten `.omit()` en Zod 4.
 */
export function createCrewRecordService({ crewService, store, queue, clock, generateId, entityType, schema, source, onCreated = () => {} }) {
  return {
    /** `fixture: true` → dato de prueba: se guarda como simulado (ver records.controller). */
    submit(body, { fixture = false } = {}) {
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw Object.assign(new HttpError(400, 'Validation Error'), { issues: [{ path: '', code: 'invalid_type', message: 'Se esperaba un objeto JSON' }] })
      }
      const forbidden = SERVER_FIELDS.filter((key) => key in body)
      if (forbidden.length) {
        throw Object.assign(new HttpError(400, 'Validation Error'), {
          issues: forbidden.map((key) => ({ path: key, code: 'unrecognized_keys', message: `El campo ${key} lo asigna el servidor` })),
        })
      }

      // Con un identificador mal formado o ausente responde la validación del esquema (400), no un 404.
      if (idSchema.safeParse(body.crewMemberId).success) {
        const crewMember = crewService.get(body.crewMemberId)
        if (crewMember.status !== 'active') throw new HttpError(409, `El tripulante ${crewMember.id} no está activo`)
      }

      const recordSource = fixture ? { ...source, simulated: true, deviceId: 'e2e-fixture' } : source
      const result = schema.safeParse({ ...body, id: generateId(), recordedAt: clock.now().toISOString(), source: recordSource })
      if (!result.success) {
        throw Object.assign(new HttpError(400, 'Validation Error'), { issues: formatIssues(result.error) })
      }
      const record = store.save(result.data)
      queue.enqueue({ entityType, operation: 'create', payload: record })
      onCreated(record)
      return record
    },

    list: ({ crewMemberId, limit }) => store.list({ filter: (r) => !crewMemberId || r.crewMemberId === crewMemberId, limit }),
  }
}
