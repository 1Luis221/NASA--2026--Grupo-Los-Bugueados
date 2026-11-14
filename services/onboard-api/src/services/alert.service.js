import { AlertStrictSchema, canTransitionAlertStatus } from '@astronaut-wellness/shared'

/**
 * Alertas OPERATIVAS generadas a bordo. En esta fase solo existen alertas de
 * comunicaciones (pérdida y recuperación del enlace): no hay diagnósticos ni
 * umbrales clínicos.
 */
export function createAlertService({ alertStore, queue, clock, generateId }) {
  let linkAlertId = null

  function save(alert, operation) {
    const parsed = alertStore.save(AlertStrictSchema.parse(alert))
    queue.enqueue({ entityType: 'alert', operation, payload: parsed })
    return parsed
  }

  function resolve(id) {
    const alert = alertStore.get(id)
    if (!alert || !canTransitionAlertStatus(alert.status, 'resolved')) return alert
    const now = clock.now().toISOString()
    return save({ ...alert, status: 'resolved', resolvedAt: now, updatedAt: now }, 'update')
  }

  return {
    list: ({ status, severity, limit }) =>
      alertStore.list({
        filter: (a) => (!status || a.status === status) && (!severity || a.severity === severity),
        limit,
      }),

    /** Listener de cambios del enlace: abre una alerta al perderlo y la resuelve al recuperarlo. */
    handleLinkChange({ previous, current }) {
      if (current === 'disconnected' && !linkAlertId) {
        const now = clock.now().toISOString()
        linkAlertId = save(
          {
            id: generateId(),
            origin: 'onboard',
            category: 'communication',
            severity: 'warning',
            status: 'active',
            title: 'Enlace nave–Tierra interrumpido',
            message: 'Los datos se conservan en la cola local y se enviarán al recuperar el enlace.',
            createdAt: now,
            updatedAt: now,
          },
          'create',
        ).id
      } else if (previous === 'disconnected' && current !== 'disconnected' && linkAlertId) {
        resolve(linkAlertId)
        linkAlertId = null
      }
    },
  }
}
