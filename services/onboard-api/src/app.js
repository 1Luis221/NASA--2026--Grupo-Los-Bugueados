import express from 'express'
import { API_PREFIX } from '@astronaut-wellness/shared'
import { errorHandler, notFound } from './middleware/errors.js'
import { createApiRouter } from './routes/api.routes.js'
import { createHealthRouter } from './routes/health.routes.js'

/**
 * Crea la aplicación Express a partir de un contexto (ver context.js),
 * sin abrir ningún puerto, para poder probarla de forma aislada.
 */
export function createApp(ctx) {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '100kb' }))

  app.use(
    '/health',
    createHealthRouter({
      serviceName: ctx.config.serviceName,
      getDetails: () => ({ link: ctx.link.getStatus().state, queue: ctx.queue.stats().byStatus }),
    }),
  )
  app.use(API_PREFIX, createApiRouter(ctx))

  app.use(notFound)
  app.use(errorHandler)

  return app
}
