import { API_PREFIX } from '@astronaut-wellness/shared/constants'
import { createApiClient } from '@astronaut-wellness/ui'

/**
 * Endpoints de Onboard API (docs/communications.md). Rutas relativas (/api)
 * a través del proxy de Vite; respuestas sin transformar ({ data, count } / { data }).
 * La nave no tiene Socket.IO: el estado se consulta por HTTP (sondeo).
 */
export function createOnboardApi(client = createApiClient({ baseUrl: API_PREFIX }), { devTools = import.meta.env.DEV } = {}) {
  return {
    listCrew: ({ signal } = {}) => client.get('/crew', { signal }),
    getCrewMember: (id, { signal } = {}) => client.get(`/crew/${encodeURIComponent(id)}`, { signal }),

    listVitals: ({ crewMemberId, limit, signal } = {}) => client.get('/vitals', { query: { crewMemberId, limit }, signal }),
    listCheckIns: ({ crewMemberId, limit, signal } = {}) =>
      client.get('/check-ins', { query: { crewMemberId, limit }, signal }),
    /**
     * Cuerpo: CheckInInput (WellnessCheckIn sin id, recordedAt ni source).
     * Devuelve { status, body } para poder exigir 201 Created antes de confirmar.
     */
    submitCheckIn: (body, { signal } = {}) => client.post('/check-ins', body, { signal, withStatus: true }),
    listCameraMetrics: ({ crewMemberId, limit, signal } = {}) =>
      client.get('/camera-metrics', { query: { crewMemberId, limit }, signal }),
    /** Cuerpo: métricas AGREGADAS de una ventana (CameraMetrics sin id, recordedAt ni source). Nunca imágenes. */
    submitCameraMetrics: (body, { signal } = {}) => client.post('/camera-metrics', body, { signal, withStatus: true }),
    listVigilanceTests: ({ crewMemberId, limit, signal } = {}) =>
      client.get('/vigilance-tests', { query: { crewMemberId, limit }, signal }),
    /**
     * Cuerpo: VigilanceTest sin id, recordedAt ni source. Devuelve { status, body }.
     * `automated: true` (solo en desarrollo): las respuestas no las dio una persona
     * (p. ej. el E2E). Se envía X-Data-Fixture y Onboard API lo guarda como SIMULADO.
     * Solo puede REBAJAR la procedencia: un cliente nunca puede declararse "real".
     */
    submitVigilanceTest: (body, { signal, automated = false } = {}) =>
      client.post('/vigilance-tests', body, { signal, withStatus: true, ...(automated && import.meta.env.DEV && devTools && { headers: { 'X-Data-Fixture': '1' } }) }),
    listAlerts: ({ status, severity, limit, signal } = {}) =>
      client.get('/alerts', { query: { status, severity, limit }, signal }),

    getSyncStatus: ({ signal } = {}) => client.get('/sync/status', { signal }),
    listSyncEvents: ({ status, limit, signal } = {}) => client.get('/sync/events', { query: { status, limit }, signal }),

    /**
     * Controles de simulación (/api/dev). En un build de producción no existen
     * (`dev: null`): la interfaz no puede llamar a esos endpoints.
     */
    // `import.meta.env.DEV` es una constante de compilación: en producción la rama se elimina del bundle.
    dev:
      import.meta.env.DEV && devTools
      ? {
          getLink: ({ signal } = {}) => client.get('/dev/link', { signal }),
          /** Cuerpo: { state?, latencyMs?, degradedLatencyMs?, degradedFailureRate? } (al menos uno). */
          updateLink: (changes, { signal } = {}) => client.put('/dev/link', changes, { signal }),
          injectFailures: (count, { signal } = {}) => client.post('/dev/link/failures', { count }, { signal }),
          tickTelemetry: ({ signal } = {}) => client.post('/dev/telemetry/tick', undefined, { signal }),
          flushSync: ({ signal } = {}) => client.post('/dev/sync/flush', undefined, { signal }),
        }
      : null,
  }
}

/** Intervalo de sondeo del estado de la nave (~3 s). */
export const ONBOARD_POLL_INTERVAL_MS = 3000

/** Instancia compartida por toda la aplicación. */
export const onboardApi = createOnboardApi()
