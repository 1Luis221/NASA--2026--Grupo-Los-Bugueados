import { Router } from 'express'
import { createRecordsController } from '../controllers/records.controller.js'
import { createSyncController } from '../controllers/sync.controller.js'
import { validate } from '../middleware/validate.js'
import { AlertsQuerySchema, LimitQuerySchema, RecordsQuerySchema } from './query-schemas.js'

/** Rutas de negocio montadas bajo API_PREFIX (/api). */
export function createApiRouter(ctx) {
  const router = Router()
  const sync = createSyncController(ctx.services)
  const records = createRecordsController(ctx.services)

  // Sincronización nave → tierra (único canal de entrada de datos).
  router.post('/sync/events', sync.receiveEvent)
  router.get('/sync/events', validate(LimitQuerySchema, 'query'), sync.listEvents)
  router.get('/sync/stats', sync.stats)

  // Consultas para el dashboard.
  router.get('/crew', records.listCrew)
  router.get('/crew/:id', records.getCrewMember)
  router.get('/vitals', validate(RecordsQuerySchema, 'query'), records.listVitals)
  router.get('/check-ins', validate(RecordsQuerySchema, 'query'), records.listCheckIns)
  router.get('/camera-metrics', validate(RecordsQuerySchema, 'query'), records.listCameraMetrics)
  router.get('/vigilance-tests', validate(RecordsQuerySchema, 'query'), records.listVigilanceTests)
  router.get('/alerts', validate(AlertsQuerySchema, 'query'), records.listAlerts)

  return router
}
