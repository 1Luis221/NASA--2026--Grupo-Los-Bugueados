import { z } from 'zod'
import { SYSTEM_NODES, SyncAckStrictSchema, SyncEventSchema, idSchema } from '@astronaut-wellness/shared'
import { truncate } from '../lib/runtime.js'
import { HttpError } from '../middleware/errors.js'

/** Mínimo necesario para poder responder con un SyncAck aunque el evento sea inválido. */
const EventReferenceSchema = z.object({
  id: idSchema,
  sequence: z.int().min(0),
  origin: z.enum(SYSTEM_NODES),
})

const SELF = 'ground'

/** HTTP: accepted → 201, duplicate → 200 (idempotente), rejected → 422. */
const HTTP_STATUS = Object.freeze({ accepted: 201, duplicate: 200, rejected: 422 })

const summarizeIssues = (issues) =>
  truncate(issues.slice(0, 3).map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`).join('; '), 500)

/** true si `incoming` es más antiguo que el registro almacenado (last-write-wins). */
const isStale = (incoming, stored) =>
  Boolean(stored?.updatedAt && incoming.updatedAt && Date.parse(incoming.updatedAt) < Date.parse(stored.updatedAt))

/**
 * Recepción idempotente de SyncEvent procedentes de la nave.
 *
 * 1. Valida con SyncEventSchema en modo TOLERANTE (dato entrante).
 * 2. Si el `id` ya fue procesado → `duplicate`, sin reaplicar ni notificar.
 * 3. Aplica el payload (upsert por entityId; las versiones antiguas no
 *    sobrescriben a las nuevas) y notifica a los clientes en tiempo real.
 * 4. Responde siempre con un SyncAck creado en modo ESTRICTO.
 */
export function createSyncReceiver({ recordStores, syncLog, notifier, clock, logger }) {
  function buildAck(ref, result, error) {
    return SyncAckStrictSchema.parse({
      eventId: ref.id,
      sequence: ref.sequence,
      origin: SELF,
      destination: ref.origin,
      result,
      receivedAt: clock.now().toISOString(),
      ...(error && { error }),
    })
  }

  function reject(ref, code, message) {
    const ack = buildAck(ref, 'rejected', { code, message })
    syncLog.recordRejected({ eventId: ref.id, sequence: ref.sequence, origin: ref.origin, code, message, receivedAt: ack.receivedAt })
    logger.warn(`evento #${ref.sequence} (${ref.id}) rechazado: ${code}`)
    return { httpStatus: HTTP_STATUS.rejected, ack }
  }

  function receive(raw) {
    const parsed = SyncEventSchema.safeParse(raw)
    if (!parsed.success) {
      const ref = EventReferenceSchema.safeParse(raw)
      if (!ref.success || ref.data.origin === SELF) {
        throw new HttpError(400, 'Evento de sincronización no identificable', { reason: summarizeIssues(parsed.error.issues) })
      }
      return reject(ref.data, 'INVALID_EVENT', summarizeIssues(parsed.error.issues))
    }

    const event = parsed.data
    // Con dos nodos, un destino distinto de tierra implica origen en tierra: no
    // existe un SyncAck válido para responderlo (origin y destination serían iguales).
    if (event.destination !== SELF) {
      throw new HttpError(400, 'El evento no está dirigido a tierra', { origin: event.origin, destination: event.destination })
    }

    if (syncLog.isProcessed(event.id)) {
      syncLog.recordDuplicate()
      return { httpStatus: HTTP_STATUS.duplicate, ack: buildAck(event, 'duplicate') }
    }

    const store = recordStores[event.entityType]
    const stored = store.get(event.entityId)
    const stale = isStale(event.payload, stored)
    if (!stale) store.save(event.payload)

    const ack = buildAck(event, 'accepted')
    syncLog.recordAccepted(event, ack.receivedAt)
    if (stale) {
      logger.warn(`evento #${event.sequence}: versión antigua de ${event.entityType} ${event.entityId}, no se aplica`)
    } else {
      notifier.publish(event)
    }
    return { httpStatus: HTTP_STATUS.accepted, ack }
  }

  return { receive }
}
