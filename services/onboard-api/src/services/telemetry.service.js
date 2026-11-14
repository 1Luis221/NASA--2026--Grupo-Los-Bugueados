/**
 * Telemetría simulada: genera lecturas, las guarda y las encola para tierra.
 */
export function createTelemetryService({ simulator, crewService, vitalsStore, queue, logger }) {
  let timer = null

  function tick() {
    const readings = simulator.generate(crewService.listActive())
    for (const reading of readings) {
      vitalsStore.save(reading)
      queue.enqueue({ entityType: 'vital_signs', operation: 'create', payload: reading })
    }
    return readings
  }

  return {
    tick,

    listVitals: ({ crewMemberId, limit }) =>
      vitalsStore.list({ filter: (v) => !crewMemberId || v.crewMemberId === crewMemberId, limit }),

    /** Generación periódica. intervalMs <= 0 la desactiva. */
    start(intervalMs) {
      if (timer || intervalMs <= 0) return
      timer = setInterval(() => {
        try {
          tick()
        } catch (err) {
          logger.error('error generando telemetría simulada', err)
        }
      }, intervalMs)
    },

    stop() {
      clearInterval(timer)
      timer = null
    },

    isRunning: () => timer !== null,
  }
}
