/**
 * Estado de sincronización de un registro creado a bordo, SIN inferir nada a
 * partir de ausencias en consultas parciales.
 *
 * Contratos de Onboard API (comprobados en services/onboard-api):
 * - GET /api/sync/events?status&limit → ordenado por `sequence` ASCENDENTE y
 *   recortado a `limit` (máx. 500) desde el principio; sin paginación; `count`
 *   es lo devuelto, no el total. Solo da los eventos MÁS ANTIGUOS de cada estado.
 * - GET /api/sync/status → `queue.byStatus` se calcula de forma síncrona sobre
 *   toda la cola: es una instantánea completa y atómica.
 *
 * Evidencias aceptadas (de más a menos directa):
 * 1. El evento aparece en una lista de estado → ese es su estado.
 * 2. Una instantánea de /sync/status pedida DESPUÉS de saber que el registro
 *    existe muestra 0 eventos sin acuse → todos los eventos existentes, incluido
 *    este, están confirmados ('acknowledged'). Es una prueba completa, no parcial.
 * En cualquier otro caso: 'unverified' (estado conservador) o 'checking'.
 *
 * Solo se comparan horas del navegador (cuándo se pidió algo frente a cuándo se
 * supo que el registro existía): nunca horas del servidor, para evitar desfases.
 */

/** Estados que todavía no tienen acuse de Ground API. */
export const UNACKNOWLEDGED = Object.freeze(['pending', 'sending', 'retry_scheduled', 'failed'])

/** Máximo que admite GET /api/sync/events; una lista de este tamaño puede estar truncada. */
export const SYNC_EVENTS_LIMIT = 500

const after = (a, b) => Date.parse(a) >= Date.parse(b)

/** Eventos sin acuse pendientes de varios estados + si alguna lista pudo truncarse. */
export function buildIndex(requestedAt, listsByStatus, limit = SYNC_EVENTS_LIMIT) {
  const lists = Object.entries(listsByStatus)
  return {
    requestedAt,
    events: lists.flatMap(([, events]) => events),
    truncated: lists.some(([, events]) => events.length >= limit),
  }
}

/** Número de eventos sin acuse en una instantánea de /sync/status. */
export const unacknowledgedCount = (byStatus) => UNACKNOWLEDGED.reduce((total, s) => total + (byStatus?.[s] ?? 0), 0)

/**
 * @param index      { requestedAt, events, truncated } (listas de estados sin acuse)
 * @param snapshot   { requestedAt, receivedAt, byStatus } (GET /api/sync/status)
 * @param entityId   id del registro (WellnessCheckIn.id…)
 * @param existsSince hora del NAVEGADOR en que se supo que el registro existía
 *                    (respuesta 201 o respuesta del historial que lo incluye)
 * @returns { state, evidence?, event?, verifiedAt?, reason? }
 *   state: 'pending' | 'sending' | 'retry_scheduled' | 'failed' | 'acknowledged' | 'unverified' | 'checking'
 */
export function deriveSyncStatus({ index, snapshot, entityId, existsSince }) {
  if (!entityId || !existsSince) return { state: 'checking' }

  const indexIsFresh = index && after(index.requestedAt, existsSince)
  const event = indexIsFresh ? index.events.find((e) => e.entityId === entityId) : null
  if (event) return { state: event.status, evidence: 'event', event }

  const snapshotIsFresh = snapshot?.byStatus && after(snapshot.requestedAt, existsSince)
  if (snapshotIsFresh && unacknowledgedCount(snapshot.byStatus) === 0) {
    return { state: 'acknowledged', evidence: 'queue-drained', verifiedAt: snapshot.receivedAt }
  }

  if (!indexIsFresh && !snapshotIsFresh) return { state: 'checking' }
  return { state: 'unverified', reason: index?.truncated ? 'partial-query' : 'queue-busy' }
}

/** Error más reciente entre los eventos con reintento o fallidos. */
export function latestSyncError(index) {
  const withError = (index?.events ?? []).filter((e) => e.lastError)
  withError.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
  return withError[0] ?? null
}
