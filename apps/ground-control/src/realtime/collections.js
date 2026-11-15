import {
  AlertSchema,
  CameraMetricsSchema,
  CrewMemberSchema,
  SOCKET_EVENTS,
  VigilanceTestSchema,
  VitalSignsSchema,
  WellnessCheckInSchema,
} from '@astronaut-wellness/shared'
import { createRecordStore } from './record-store.js'

/**
 * Colecciones que Ground Control recibe en tiempo real. Cada una define su
 * evento Socket.IO (SOCKET_EVENTS), el esquema TOLERANTE con el que se valida
 * el payload entrante, cómo cargarla por HTTP y su límite en memoria.
 */
export const COLLECTIONS = Object.freeze({
  crew_member: {
    events: [SOCKET_EVENTS.CREW_UPDATED],
    schema: CrewMemberSchema,
    fetch: (api, { signal }) => api.listCrew({ signal }),
    store: { limit: 100, timestampOf: (r) => r.updatedAt },
  },
  vital_signs: {
    events: [SOCKET_EVENTS.VITALS_RECORDED],
    schema: VitalSignsSchema,
    fetch: (api, query) => api.listVitals(query),
    store: { limit: 200, groupBy: 'crewMemberId' },
  },
  wellness_check_in: {
    events: [SOCKET_EVENTS.CHECK_IN_SUBMITTED],
    schema: WellnessCheckInSchema,
    fetch: (api, query) => api.listCheckIns(query),
    store: { limit: 100, groupBy: 'crewMemberId' },
  },
  camera_metrics: {
    events: [SOCKET_EVENTS.CAMERA_METRICS_RECORDED],
    schema: CameraMetricsSchema,
    fetch: (api, query) => api.listCameraMetrics(query),
    store: { limit: 200, groupBy: 'crewMemberId' },
  },
  vigilance_test: {
    events: [SOCKET_EVENTS.VIGILANCE_TEST_RECORDED],
    schema: VigilanceTestSchema,
    fetch: (api, query) => api.listVigilanceTests(query),
    store: { limit: 100, groupBy: 'crewMemberId' },
  },
  alert: {
    events: [SOCKET_EVENTS.ALERT_CREATED, SOCKET_EVENTS.ALERT_UPDATED],
    schema: AlertSchema,
    // /api/alerts solo admite status, severity y limit; el filtro por tripulante se aplica en local.
    fetch: (api, { status, severity, limit, signal }) => api.listAlerts({ status, severity, limit, signal }),
    store: { limit: 500, timestampOf: (r) => r.createdAt },
  },
})

/** Un almacén por colección. `limits` permite ajustar el máximo en memoria. */
export function createStores(limits = {}) {
  return Object.fromEntries(
    Object.entries(COLLECTIONS).map(([type, config]) => [
      type,
      createRecordStore({ ...config.store, ...(limits[type] !== undefined && { limit: limits[type] }) }),
    ]),
  )
}
