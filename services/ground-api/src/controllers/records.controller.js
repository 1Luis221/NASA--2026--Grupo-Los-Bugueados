/** Consultas para el dashboard terrestre. */
export function createRecordsController({ recordsService }) {
  const list = (res, data) => res.json({ data, count: data.length })

  return {
    listCrew: (_req, res) => list(res, recordsService.listCrew()),
    getCrewMember: (req, res) => res.json({ data: recordsService.getCrewMember(req.params.id) }),
    listVitals: (_req, res) => list(res, recordsService.listVitals(res.locals.query)),
    listCheckIns: (_req, res) => list(res, recordsService.listCheckIns(res.locals.query)),
    listCameraMetrics: (_req, res) => list(res, recordsService.listCameraMetrics(res.locals.query)),
    listVigilanceTests: (_req, res) => list(res, recordsService.listVigilanceTests(res.locals.query)),
    listAlerts: (_req, res) => list(res, recordsService.listAlerts(res.locals.query)),
  }
}
