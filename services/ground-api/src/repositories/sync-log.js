/**
 * Registro en memoria de los SyncEvent recibidos: base del procesamiento
 * idempotente. Un `id` presente aquí ya fue aplicado y no debe reaplicarse.
 * Los rechazos NO se registran como procesados: un evento corregido con el
 * mismo id podrá aceptarse más adelante.
 */
export function createSyncLog({ rejectedLogSize = 200 } = {}) {
  const processed = new Map() // SyncEvent.id → resumen del evento aplicado
  const rejected = []
  const lastSequenceByOrigin = {}
  const counters = { accepted: 0, duplicate: 0, rejected: 0 }

  return {
    isProcessed: (eventId) => processed.has(eventId),

    recordAccepted(event, receivedAt) {
      processed.set(event.id, {
        eventId: event.id,
        sequence: event.sequence,
        origin: event.origin,
        entityType: event.entityType,
        entityId: event.entityId,
        operation: event.operation,
        receivedAt,
      })
      lastSequenceByOrigin[event.origin] = Math.max(lastSequenceByOrigin[event.origin] ?? -1, event.sequence)
      counters.accepted += 1
    },

    recordDuplicate() {
      counters.duplicate += 1
    },

    recordRejected(entry) {
      rejected.push(entry)
      if (rejected.length > rejectedLogSize) rejected.shift()
      counters.rejected += 1
    },

    /** Eventos aplicados, más recientes primero. */
    listProcessed: ({ limit } = {}) => [...processed.values()].reverse().slice(0, limit),

    stats: () => ({
      ...counters,
      processedEvents: processed.size,
      lastSequenceByOrigin: { ...lastSequenceByOrigin },
      recentRejections: rejected.slice(-10).reverse(),
    }),
  }
}
