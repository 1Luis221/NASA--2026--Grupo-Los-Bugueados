import { CREW_ROSTER } from './data/crew-roster.js'
import { createLinkSimulator } from './link/link-simulator.js'
import { createMemoryStore } from './repositories/memory-store.js'
import { createAlertService } from './services/alert.service.js'
import { createCheckInService } from './services/check-in.service.js'
import { createCrewService } from './services/crew.service.js'
import { createTelemetryService } from './services/telemetry.service.js'
import { createTelemetrySimulator } from './simulator/telemetry-simulator.js'
import { createGroundClient } from './sync/ground-client.js'
import { createSyncQueue } from './sync/sync-queue.js'
import { createSyncWorker } from './sync/sync-worker.js'
import { loadConfig } from './config.js'
import { createLogger, createRandom, generateId as defaultGenerateId, sleep as defaultSleep, systemClock } from './lib/runtime.js'

/**
 * Compone todos los módulos de la nave. Cualquier dependencia se puede
 * sustituir (reloj, azar, cliente de tierra, logger…) para las pruebas.
 * No arranca temporizadores: eso lo hace `start()`.
 */
export function createOnboardContext({
  config = loadConfig(),
  clock = systemClock,
  sleep = defaultSleep,
  generateId = defaultGenerateId,
  logger = createLogger(config.serviceName),
  groundClient = createGroundClient({ baseUrl: config.groundApiUrl, timeoutMs: config.groundRequestTimeoutMs }),
  roster = CREW_ROSTER,
} = {}) {
  // Generadores independientes: las pérdidas del enlace no alteran la telemetría simulada.
  const telemetryRng = createRandom(config.telemetry.seed)
  const linkRng = createRandom(config.telemetry.seed + 1)

  const stores = {
    crew: createMemoryStore(),
    vitals: createMemoryStore(),
    checkIns: createMemoryStore(),
    alerts: createMemoryStore(),
  }

  const link = createLinkSimulator({ ...config.link, rng: linkRng, sleep, clock, logger })
  const queue = createSyncQueue({
    clock,
    generateId,
    maxAttempts: config.sync.maxAttempts,
    backoff: { baseMs: config.sync.backoffBaseMs, maxMs: config.sync.backoffMaxMs },
  })
  const worker = createSyncWorker({
    queue,
    link,
    groundClient,
    logger,
    batchSize: config.sync.batchSize,
    intervalMs: config.sync.intervalMs,
  })

  const crewService = createCrewService({ crewStore: stores.crew, queue })
  const telemetryService = createTelemetryService({
    simulator: createTelemetrySimulator({ rng: telemetryRng, clock, generateId }),
    crewService,
    vitalsStore: stores.vitals,
    queue,
    logger,
  })
  const checkInService = createCheckInService({ crewService, checkInStore: stores.checkIns, queue, clock, generateId })
  const alertService = createAlertService({ alertStore: stores.alerts, queue, clock, generateId })

  // Orden importante: primero se registra la alerta y después se intenta el reenvío.
  const unsubscribers = [
    link.onChange(alertService.handleLinkChange),
    link.onChange(({ previous, current }) => {
      if (previous === 'disconnected' && current !== 'disconnected') {
        worker.flush().catch((err) => logger.error('error reenviando tras la reconexión', err))
      }
    }),
  ]

  crewService.seed(roster)

  return {
    config,
    clock,
    logger,
    link,
    queue,
    worker,
    stores,
    services: { crewService, telemetryService, checkInService, alertService },

    /** Arranca la telemetría simulada y el despachador periódicos. */
    start() {
      telemetryService.start(config.telemetry.intervalMs)
      worker.start()
    },

    /** Detiene temporizadores y listeners, y espera el envío en curso. */
    async stop() {
      telemetryService.stop()
      await worker.stop()
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    },
  }
}
