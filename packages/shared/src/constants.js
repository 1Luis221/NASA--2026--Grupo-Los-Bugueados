/**
 * Puertos de desarrollo del sistema. Fuente única de verdad para
 * las configuraciones de Vite y las APIs Express.
 */
export const PORTS = Object.freeze({
  GROUND_API: 4000,
  ONBOARD_API: 4001,
  GROUND_CONTROL_UI: 5173,
  ONBOARD_UI: 5174,
  GROUND_CONTROL_PREVIEW: 4173,
  ONBOARD_PREVIEW: 4174,
})

/** Identificadores de servicio usados en logs y respuestas de /health. */
export const SERVICE_NAMES = Object.freeze({
  GROUND_API: 'ground-api',
  ONBOARD_API: 'onboard-api',
})

/** Prefijo común de las rutas de negocio de las APIs. */
export const API_PREFIX = '/api'
