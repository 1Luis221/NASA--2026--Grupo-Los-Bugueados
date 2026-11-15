/** Controladores de tripulación, mediciones, autoevaluaciones y alertas. */
/**
 * `X-Data-Fixture: 1` (SOLO con los controles de desarrollo activos): el registro
 * es un dato de prueba (fixture) y se guarda como SIMULADO, para que nunca se
 * presente como una medición real. En producción la cabecera se ignora.
 */
const isFixture = (req, devControls) => devControls && req.get('x-data-fixture') === '1'

export function createRecordsController({ crewService, telemetryService, checkInService, alertService, cameraMetricsService, vigilanceTestService }, { devControls = false } = {}) {
  const list = (res, data) => res.json({ data, count: data.length })

  return {
    listCrew: (_req, res) => list(res, crewService.list()),
    getCrewMember: (req, res) => res.json({ data: crewService.get(req.params.id) }),

    listVitals: (_req, res) => list(res, telemetryService.listVitals(res.locals.query)),

    listCheckIns: (_req, res) => list(res, checkInService.list(res.locals.query)),
    submitCheckIn: (_req, res) => res.status(201).json({ data: checkInService.submit(res.locals.body) }),

    listAlerts: (_req, res) => list(res, alertService.list(res.locals.query)),

    listCameraMetrics: (_req, res) => list(res, cameraMetricsService.list(res.locals.query)),
    submitCameraMetrics: (req, res) => res.status(201).json({ data: cameraMetricsService.submit(req.body, { fixture: isFixture(req, devControls) }) }),

    listVigilanceTests: (_req, res) => list(res, vigilanceTestService.list(res.locals.query)),
    submitVigilanceTest: (req, res) => res.status(201).json({ data: vigilanceTestService.submit(req.body, { fixture: isFixture(req, devControls) }) }),
  }
}
