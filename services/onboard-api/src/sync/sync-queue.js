import { SYNC_STATUSES, SyncEventStrictSchema, canTransitionSyncStatus } from '@astronaut-wellness/shared'
import { omitKeys } from '../lib/runtime.js'
import { computeBackoffMs } from './backoff.js'

/**
 * Cola local store-and-forward de SyncEvent (outbox), en memoria.
 *
 * - Cada evento recibe un UUID y un `sequence` monótono UNA sola vez, al
 *   encolarse; los reintentos los conservan (idempotencia en el receptor).
 * - Todo cambio de estado respeta SYNC_STATUS_TRANSITIONS y se valida con
 *   SyncEventStrictSchema: la cola nunca contiene eventos fuera de contrato.
 * - Entrega FIFO: un evento en espera de reintento bloquea a los posteriores,
 *   para que tierra reciba las actualizaciones en orden.
 */
export function createSyncQueue({ clock, generateId, maxAttempts, backoff, origin = 'onboard', destination = 'ground' }) {
  const events = new Map()
  let nextSequence = 0

  const nowIso = () => clock.now().toISOString()
  const bySequence = (a, b) => a.sequence - b.sequence

  function commit(event) {
    const parsed = SyncEventStrictSchema.parse(event)
    events.set(parsed.id, parsed)
    return parsed
  }

  function require(id) {
    const event = events.get(id)
    if (!event) throw new Error(`SyncEvent desconocido: ${id}`)
    return event
  }

  function transition(id, status, changes = {}, removeKeys = []) {
    const current = require(id)
    if (!canTransitionSyncStatus(current.status, status)) {
      throw new Error(`Transición de sincronización no permitida: ${current.status} → ${status}`)
    }
    return commit(omitKeys({ ...current, ...changes, status, updatedAt: nowIso() }, removeKeys))
  }

  return {
    /** Crea y encola un SyncEvent para `payload` (entidad ya validada). */
    enqueue({ entityType, operation, payload }) {
      const now = nowIso()
      return commit({
        id: generateId(),
        sequence: nextSequence++,
        origin,
        destination,
        entityType,
        entityId: payload.id,
        operation,
        payload,
        status: 'pending',
        attempts: 0,
        maxAttempts,
        createdAt: now,
        updatedAt: now,
      })
    },

    get: (id) => events.get(id),

    list({ status, limit } = {}) {
      const result = [...events.values()].filter((e) => !status || e.status === status).sort(bySequence)
      return limit ? result.slice(0, limit) : result
    },

    /** Eventos listos para enviar, en orden de secuencia (FIFO con bloqueo en cabeza). */
    listDue({ limit = Infinity } = {}) {
      const now = clock.now().getTime()
      const due = []
      for (const event of [...events.values()].sort(bySequence)) {
        if (due.length >= limit) break
        if (event.status === 'pending') due.push(event)
        else if (event.status === 'retry_scheduled') {
          if (Date.parse(event.nextRetryAt) > now) break
          due.push(event)
        }
      }
      return due
    },

    markSending(id) {
      const current = require(id)
      return transition(id, 'sending', { attempts: current.attempts + 1, lastAttemptAt: nowIso() })
    },

    markAcknowledged(id) {
      return transition(id, 'acknowledged', { acknowledgedAt: nowIso() }, ['nextRetryAt'])
    },

    /** Programa un reintento con backoff o marca `failed` si se agotaron los intentos. */
    markRetry(id, error) {
      const current = require(id)
      if (current.attempts >= current.maxAttempts) {
        return transition(id, 'failed', { lastError: error }, ['nextRetryAt'])
      }
      const delay = computeBackoffMs(current.attempts, backoff)
      const nextRetryAt = new Date(clock.now().getTime() + delay).toISOString()
      return transition(id, 'retry_scheduled', { lastError: error, nextRetryAt })
    },

    /** Fallo no recuperable (p. ej. SyncAck rejected): no se reintenta. */
    markFailed(id, error) {
      return transition(id, 'failed', { lastError: error }, ['nextRetryAt'])
    },

    /** Reencolado manual de un evento fallido: conserva id y sequence, reinicia intentos. */
    requeue(id) {
      return transition(id, 'pending', { attempts: 0 }, ['nextRetryAt', 'lastAttemptAt'])
    },

    stats() {
      const byStatus = Object.fromEntries(SYNC_STATUSES.map((s) => [s, 0]))
      for (const event of events.values()) byStatus[event.status] += 1
      return { total: events.size, byStatus, lastSequence: nextSequence - 1 }
    },
  }
}
