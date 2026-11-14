import { CrewMemberStrictSchema } from '@astronaut-wellness/shared'
import { HttpError } from '../middleware/errors.js'

export function createCrewService({ crewStore, queue }) {
  return {
    /** Carga la tripulación inicial y la encola para que tierra la conozca. */
    seed(roster) {
      for (const member of roster) {
        const crewMember = crewStore.save(CrewMemberStrictSchema.parse(member))
        queue.enqueue({ entityType: 'crew_member', operation: 'create', payload: crewMember })
      }
    },

    list: () => crewStore.list().reverse(),

    listActive: () => crewStore.list({ filter: (c) => c.status === 'active' }).reverse(),

    get(id) {
      const crewMember = crewStore.get(id)
      if (!crewMember) throw new HttpError(404, `Tripulante no encontrado: ${id}`)
      return crewMember
    },
  }
}
