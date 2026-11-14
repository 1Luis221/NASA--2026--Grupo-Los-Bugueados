import { SOCKET_EVENTS } from '@astronaut-wellness/shared'

/** Evento Socket.IO que corresponde a cada tipo de entidad sincronizada. */
const ENTITY_EVENTS = Object.freeze({
  crew_member: SOCKET_EVENTS.CREW_UPDATED,
  vital_signs: SOCKET_EVENTS.VITALS_RECORDED,
  wellness_check_in: SOCKET_EVENTS.CHECK_IN_SUBMITTED,
  camera_metrics: SOCKET_EVENTS.CAMERA_METRICS_RECORDED,
})

/** Nombre del evento en tiempo real para un SyncEvent aplicado. */
export function socketEventFor({ entityType, operation }) {
  if (entityType === 'alert') {
    return operation === 'create' ? SOCKET_EVENTS.ALERT_CREATED : SOCKET_EVENTS.ALERT_UPDATED
  }
  return ENTITY_EVENTS[entityType]
}

/**
 * Publica en Socket.IO las entidades aplicadas. El payload es la entidad tal
 * como la validó el contrato (solo datos agregados: nunca imágenes ni vídeo).
 */
export function createSocketNotifier(io) {
  return {
    publish(event) {
      io.emit(socketEventFor(event), event.payload)
    },
  }
}

/** Notificador nulo para pruebas o ejecuciones sin tiempo real. */
export const nullNotifier = Object.freeze({ publish() {} })
