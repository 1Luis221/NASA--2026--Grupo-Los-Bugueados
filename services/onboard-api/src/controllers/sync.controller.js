/** Estado de la cola de sincronización y del enlace. */
export function createSyncController({ queue, link, worker }) {
  return {
    listEvents: (_req, res) => {
      const data = queue.list(res.locals.query)
      res.json({ data, count: data.length })
    },
    status: (_req, res) =>
      res.json({ data: { link: link.getStatus(), queue: queue.stats(), dispatcherRunning: worker.isRunning() } }),
  }
}
