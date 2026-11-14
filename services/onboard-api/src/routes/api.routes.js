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
  const records = createRecordsController(ctx.services)
  const sync = createSyncController(ctx)

  router.get('/crew', records.listCrew)
  router.get('/crew/:id', records.getCrewMember)
  router.get('/vitals', validate(RecordsQuerySchema, 'query'), records.listVitals)
  router.get('/check-ins', validate(RecordsQuerySchema, 'query'), records.listCheckIns)
  router.post('/check-ins', validate(CheckInInputSchema), records.submitCheckIn)
  router.get('/alerts', validate(AlertsQuerySchema, 'query'), records.listAlerts)

  router.get('/sync/events', validate(SyncEventsQuerySchema, 'query'), sync.listEvents)
  router.get('/sync/status', sync.status)

  if (ctx.config.devControls) {
    const dev = createDevController({ ...ctx, telemetryService: ctx.services.telemetryService })
    router.get('/dev/link', dev.getLink)
    router.put('/dev/link', validate(LinkUpdateSchema), dev.updateLink)
    router.post('/dev/link/failures', validate(InjectFailuresSchema), dev.injectFailures)
    router.post('/dev/telemetry/tick', dev.tickTelemetry)
    router.post('/dev/sync/flush', dev.flushSync)
  }

  return router
}
