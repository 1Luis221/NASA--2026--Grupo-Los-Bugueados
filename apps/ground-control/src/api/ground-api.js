import { API_PREFIX } from '@astronaut-wellness/shared/constants'
import { createApiClient } from '@astronaut-wellness/ui'

/**
 * Endpoints de Ground API (docs/communications.md). Todas las rutas son
 * relativas (/api) y pasan por el proxy de Vite. Las respuestas se devuelven
 * sin transformar: listados { data, count }, elementos { data }.
 * Ground Control es de solo lectura: no hay operaciones de escritura.
 */
export function createGroundApi(client = createApiClient({ baseUrl: API_PREFIX })) {
  return {
    listCrew: ({ signal } = {}) => client.get('/crew', { signal }),
    getCrewMember: (id, { signal } = {}) => client.get(`/crew/${encodeURIComponent(id)}`, { signal }),

    listVitals: ({ crewMemberId, limit, signal } = {}) => client.get('/vitals', { query: { crewMemberId, limit }, signal }),
    listCheckIns: ({ crewMemberId, limit, signal } = {}) =>
      client.get('/check-ins', { query: { crewMemberId, limit }, signal }),
    listCameraMetrics: ({ crewMemberId, limit, signal } = {}) =>
      client.get('/camera-metrics', { query: { crewMemberId, limit }, signal }),
    listVigilanceTests: ({ crewMemberId, limit, signal } = {}) =>
      client.get('/vigilance-tests', { query: { crewMemberId, limit }, signal }),
    listAlerts: ({ status, severity, limit, signal } = {}) =>
      client.get('/alerts', { query: { status, severity, limit }, signal }),

    listSyncEvents: ({ limit, signal } = {}) => client.get('/sync/events', { query: { limit }, signal }),
    getSyncStats: ({ signal } = {}) => client.get('/sync/stats', { signal }),
  }
}

/** Instancia compartida por toda la aplicación. */
export const groundApi = createGroundApi()
