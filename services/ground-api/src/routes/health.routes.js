import { Router } from 'express'

/** GET /health: estado básico del servicio (liveness). */
export function createHealthRouter({ serviceName }) {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      service: serviceName,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    })
  })

  return router
}
