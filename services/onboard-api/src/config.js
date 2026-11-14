import { PORTS, SERVICE_NAMES } from '@astronaut-wellness/shared'

const toInt = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : fallback
}
const toNumber = (value, fallback) => {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) ? n : fallback
}

/**
 * Configuración del servicio a partir de variables de entorno (ver .env.example).
 * Se exporta como función para que los tests construyan configuraciones aisladas.
 */
export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV ?? 'development'

  return Object.freeze({
    serviceName: SERVICE_NAMES.ONBOARD_API,
    port: toInt(env.PORT, PORTS.ONBOARD_API),
    env: nodeEnv,
    /** Controles del simulador (/api/dev/*): nunca disponibles en producción. */
    devControls: nodeEnv !== 'production',

    groundApiUrl: env.GROUND_API_URL ?? `http://localhost:${PORTS.GROUND_API}`,
    groundRequestTimeoutMs: toInt(env.GROUND_REQUEST_TIMEOUT_MS, 5000),

    telemetry: Object.freeze({
      /** Intervalo de generación de telemetría simulada. 0 = desactivado. */
      intervalMs: toInt(env.TELEMETRY_INTERVAL_MS, 5000),
      /** Semilla del generador pseudoaleatorio (simulación reproducible). */
      seed: toInt(env.SIMULATION_SEED, 42),
    }),

    sync: Object.freeze({
      /** Intervalo del despachador de la cola. 0 = solo envío manual. */
      intervalMs: toInt(env.SYNC_INTERVAL_MS, 1000),
      batchSize: toInt(env.SYNC_BATCH_SIZE, 50),
      maxAttempts: toInt(env.SYNC_MAX_ATTEMPTS, 10),
      backoffBaseMs: toInt(env.SYNC_BACKOFF_BASE_MS, 1000),
      backoffMaxMs: toInt(env.SYNC_BACKOFF_MAX_MS, 30000),
    }),

    link: Object.freeze({
      initialState: env.LINK_STATE ?? 'connected',
      latencyMs: toInt(env.LINK_LATENCY_MS, 0),
      degradedLatencyMs: toInt(env.LINK_DEGRADED_LATENCY_MS, 1500),
      degradedFailureRate: toNumber(env.LINK_DEGRADED_FAILURE_RATE, 0.3),
    }),
  })
}
