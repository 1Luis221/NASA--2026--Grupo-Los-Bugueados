import { HttpError } from '../middleware/errors.js'

/** Consultas de solo lectura sobre los registros recibidos desde la nave. */
export function createRecordsService({ recordStores, syncLog }) {
  const byCrew = (crewMemberId) => (record) => !crewMemberId || record.crewMemberId === crewMemberId

  return {
    listCrew: () => recordStores.crew_member.list().reverse(),

    getCrewMember(id) {
      const crewMember = recordStores.crew_member.get(id)
      if (!crewMember) throw new HttpError(404, `Tripulante no encontrado: ${id}`)
      return crewMember
    },

    listVitals: ({ crewMemberId, limit }) => recordStores.vital_signs.list({ filter: byCrew(crewMemberId), limit }),
    listCheckIns: ({ crewMemberId, limit }) => recordStores.wellness_check_in.list({ filter: byCrew(crewMemberId), limit }),
    listCameraMetrics: ({ crewMemberId, limit }) => recordStores.camera_metrics.list({ filter: byCrew(crewMemberId), limit }),
    listVigilanceTests: ({ crewMemberId, limit }) => recordStores.vigilance_test.list({ filter: byCrew(crewMemberId), limit }),

    listAlerts: ({ status, severity, limit }) =>
      recordStores.alert.list({
        filter: (a) => (!status || a.status === status) && (!severity || a.severity === severity),
        limit,
      }),

    listSyncEvents: ({ limit }) => syncLog.listProcessed({ limit }),
    syncStats: () => syncLog.stats(),
  }
}
