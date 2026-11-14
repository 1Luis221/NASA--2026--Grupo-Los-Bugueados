/**
 * Controles del simulador para desarrollo y pruebas. Solo se montan cuando
 * `config.devControls` es true (nunca con NODE_ENV=production).
 */
export function createDevController({ link, worker, telemetryService }) {
  return {
    getLink: (_req, res) => res.json({ data: link.getStatus() }),

    updateLink: (_req, res) => {
      const { state, ...settings } = res.locals.body
      link.configure(settings)
      if (state) link.setState(state)
      res.json({ data: link.getStatus() })
    },

    injectFailures: (_req, res) => res.json({ data: link.injectFailures(res.locals.body.count) }),

    tickTelemetry: (_req, res) => {
      const data = telemetryService.tick()
      res.status(201).json({ data, count: data.length })
    },

    flushSync: async (_req, res) => res.json({ data: await worker.flush() }),
  }
}
