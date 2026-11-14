/** Recepción de eventos de la nave y estado de la sincronización. */
export function createSyncController({ syncReceiver, recordsService }) {
  return {
    receiveEvent: (req, res) => {
      const { httpStatus, ack } = syncReceiver.receive(req.body)
      res.status(httpStatus).json(ack)
    },
    listEvents: (_req, res) => {
      const data = recordsService.listSyncEvents(res.locals.query)
      res.json({ data, count: data.length })
    },
    stats: (_req, res) => res.json({ data: recordsService.syncStats() }),
  }
}
