import { Router } from 'express'

/** GET /health: estado básico del servicio (liveness) y detalles opcionales. */
export function createHealthRouter({ serviceName, getDetails = () => ({}) }) {
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      service: serviceName,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      ...getDetails(),
    })
  })

  return router
}
