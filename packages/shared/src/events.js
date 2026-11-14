/**
 * Nombres de eventos Socket.IO compartidos por clientes y servidores.
 * Convención "dominio:acción". ground-api emite los eventos de entidades y
 * alertas hacia el dashboard; los de sincronización y enlace siguen reservados
 * (la sincronización nave–Tierra va por HTTP). Ver docs/communications.md.
 */
export const SOCKET_EVENTS = Object.freeze({
  // Telemetría y autoevaluaciones (payload: entidad validada por su esquema)
  VITALS_RECORDED: 'vitals:recorded',
  CAMERA_METRICS_RECORDED: 'camera:metrics-recorded',
  CHECK_IN_SUBMITTED: 'check-in:submitted',

  // Tripulación
  CREW_UPDATED: 'crew:updated',

  // Alertas
  ALERT_CREATED: 'alert:created',
  ALERT_UPDATED: 'alert:updated',

  // Sincronización nave ↔ tierra
  SYNC_EVENT: 'sync:event',
  SYNC_ACK: 'sync:ack',
  SYNC_STATUS: 'sync:status',

  // Estado del enlace de comunicaciones
  LINK_STATUS: 'link:status',
})
