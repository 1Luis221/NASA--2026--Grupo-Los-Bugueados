import { Router } from 'express'
import { createDevController } from '../controllers/dev.controller.js'
import { createRecordsController } from '../controllers/records.controller.js'
import { createSyncController } from '../controllers/sync.controller.js'
import { validate } from '../middleware/validate.js'
import { CheckInInputSchema } from '../services/check-in.service.js'
import {
  AlertsQuerySchema,
  InjectFailuresSchema,
  LinkUpdateSchema,
  RecordsQuerySchema,
  SyncEventsQuerySchema,
} from './query-schemas.js'

/** Rutas de negocio montadas bajo API_PREFIX (/api). */
export function createApiRouter(ctx) {
  const router = Router()
  const records = createRecordsController(ctx.services, { devControls: ctx.config.devControls })
  const sync = createSyncController(ctx)

  router.get('/crew', records.listCrew)
  router.get('/crew/:id', records.getCrewMember)
  router.get('/vitals', validate(RecordsQuerySchema, 'query'), records.listVitals)
  router.get('/check-ins', validate(RecordsQuerySchema, 'query'), records.listCheckIns)
  router.post('/check-ins', validate(CheckInInputSchema), records.submitCheckIn)
  router.get('/alerts', validate(AlertsQuerySchema, 'query'), records.listAlerts)
  router.get('/camera-metrics', validate(RecordsQuerySchema, 'query'), records.listCameraMetrics)
  router.post('/camera-metrics', records.submitCameraMetrics)
  router.get('/vigilance-tests', validate(RecordsQuerySchema, 'query'), records.listVigilanceTests)
  router.post('/vigilance-tests', records.submitVigilanceTest)

  router.get('/sync/events', validate(SyncEventsQuerySchema, 'query'), sync.listEvents)
  router.get('/sync/status', sync.status)

  if (ctx.config.devControls) {
    const dev = createDevController({ ...ctx, telemetryService: ctx.services.telemetryService })
    router.get('/dev/link', dev.getLink)
    router.put('/dev/link', validate(LinkUpdateSchema), dev.updateLink)
    router.post('/dev/link/failures', validate(InjectFailuresSchema), dev.injectFailures)
    router.post('/dev/telemetry/tick', dev.tickTelemetry)
    router.post('/dev/sync/flush', dev.flushSync)
    router.post('/dev/alerts/check-staleness', dev.checkStaleness)
    router.get('/dev/alerts/rules', dev.alertRules)
  }

  return router
}
