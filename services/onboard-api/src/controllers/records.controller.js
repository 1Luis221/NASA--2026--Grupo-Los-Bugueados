/** Controladores de tripulación, mediciones, autoevaluaciones y alertas. */
export function createRecordsController({ crewService, telemetryService, checkInService, alertService }) {
  const list = (res, data) => res.json({ data, count: data.length })

  return {
    listCrew: (_req, res) => list(res, crewService.list()),
    getCrewMember: (req, res) => res.json({ data: crewService.get(req.params.id) }),

    listVitals: (_req, res) => list(res, telemetryService.listVitals(res.locals.query)),

    listCheckIns: (_req, res) => list(res, checkInService.list(res.locals.query)),
    submitCheckIn: (_req, res) => res.status(201).json({ data: checkInService.submit(res.locals.body) }),

    listAlerts: (_req, res) => list(res, alertService.list(res.locals.query)),
  }
}
