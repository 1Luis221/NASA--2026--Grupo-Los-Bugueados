/**
 * Transiciones de estado permitidas. Las APIs las usarán para rechazar
 * cambios incoherentes (p. ej. reabrir una alerta resuelta).
 */

export const ALERT_STATUS_TRANSITIONS = Object.freeze({
  active: Object.freeze(['acknowledged', 'resolved']),
  acknowledged: Object.freeze(['resolved']),
  resolved: Object.freeze([]),
})

export const SYNC_STATUS_TRANSITIONS = Object.freeze({
  pending: Object.freeze(['sending']),
  sending: Object.freeze(['acknowledged', 'retry_scheduled', 'failed']),
  retry_scheduled: Object.freeze(['sending', 'failed']),
  acknowledged: Object.freeze([]),
  // Un evento fallido solo puede reencolarse manualmente.
  failed: Object.freeze(['pending']),
})

const canTransition = (table) => (from, to) => table[from]?.includes(to) ?? false

/** ¿Se permite pasar una alerta de `from` a `to`? */
export const canTransitionAlertStatus = canTransition(ALERT_STATUS_TRANSITIONS)

/** ¿Se permite pasar un SyncEvent de `from` a `to`? */
export const canTransitionSyncStatus = canTransition(SYNC_STATUS_TRANSITIONS)
