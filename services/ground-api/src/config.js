import { PORTS, SERVICE_NAMES } from '@astronaut-wellness/shared'

const toInt = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Configuración del servicio a partir de variables de entorno (ver .env.example).
 * Se exporta como función para que los tests construyan configuraciones aisladas.
 */
export function loadConfig(env = process.env) {
  return Object.freeze({
    serviceName: SERVICE_NAMES.GROUND_API,
    port: toInt(env.PORT, PORTS.GROUND_API),
    env: env.NODE_ENV ?? 'development',
    /** Orígenes permitidos para Socket.IO si el dashboard no usa el proxy de Vite. */
    socketCorsOrigins: (env.SOCKET_CORS_ORIGINS ?? `http://localhost:${PORTS.GROUND_CONTROL_UI}`)
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    /** Máximo de rechazos recientes conservados para diagnóstico. */
    rejectedLogSize: toInt(env.REJECTED_LOG_SIZE, 200),
  })
}
