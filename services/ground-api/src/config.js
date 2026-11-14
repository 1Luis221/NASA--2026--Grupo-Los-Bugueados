import { PORTS, SERVICE_NAMES } from '@astronaut-wellness/shared'

/** Configuración del servicio a partir de variables de entorno. */
export const config = Object.freeze({
  serviceName: SERVICE_NAMES.GROUND_API,
  port: Number(process.env.PORT) || PORTS.GROUND_API,
  env: process.env.NODE_ENV ?? 'development',
})
