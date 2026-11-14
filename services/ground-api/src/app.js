import express from 'express'
import { config } from './config.js'
import { createHealthRouter } from './routes/health.routes.js'
import { errorHandler, notFound } from './middleware/errors.js'

/**
 * Crea la aplicación Express sin abrir ningún puerto,
 * para poder probarla de forma aislada (p. ej. con supertest).
 */
export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '100kb' }))

  app.use('/health', createHealthRouter({ serviceName: config.serviceName }))
  // Las rutas de negocio se montarán bajo API_PREFIX (/api) en fases posteriores.

  app.use(notFound)
  app.use(errorHandler)

  return app
}
