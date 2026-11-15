import { WellnessCheckInStrictSchema } from '@astronaut-wellness/shared'
import { HttpError } from '../middleware/errors.js'

/**
 * Cuerpo aceptado por POST /api/check-ins: el contrato WellnessCheckIn sin los
 * campos que controla el servidor. Hereda el modo estricto (rechaza erratas).
 */
export const CheckInInputSchema = WellnessCheckInStrictSchema.omit({ id: true, recordedAt: true, source: true })

export function createCheckInService({ crewService, checkInStore, queue, clock, generateId, onCreated = () => {} }) {
  return {
    /** `input` ya validado con CheckInInputSchema. */
    submit(input) {
      const crewMember = crewService.get(input.crewMemberId)
      if (crewMember.status !== 'active') {
        throw new HttpError(409, `El tripulante ${crewMember.id} no está activo`)
      }

      const checkIn = WellnessCheckInStrictSchema.parse({
        ...input,
        id: generateId(),
        recordedAt: clock.now().toISOString(),
        // Autoevaluación enviada por la tripulación a través de la API: dato real.
        source: { type: 'self_report', simulated: false },
      })
      checkInStore.save(checkIn)
      queue.enqueue({ entityType: 'wellness_check_in', operation: 'create', payload: checkIn })
      onCreated(checkIn)
      return checkIn
    },

    list: ({ crewMemberId, limit }) =>
      checkInStore.list({ filter: (c) => !crewMemberId || c.crewMemberId === crewMemberId, limit }),
  }
}
