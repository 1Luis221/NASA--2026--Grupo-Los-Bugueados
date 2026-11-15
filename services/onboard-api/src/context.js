import { CameraMetricsStrictSchema, VigilanceTestStrictSchema } from '@astronaut-wellness/shared'
import { CREW_ROSTER } from './data/crew-roster.js'
import { createLinkSimulator } from './link/link-simulator.js'
import { createMemoryStore } from './repositories/memory-store.js'
import { resolveRules } from './alerts/demo-rules.js'
import { createAlertService } from './services/alert.service.js'
import { createCheckInService } from './services/check-in.service.js'
import { createCrewRecordService } from './services/crew-record.service.js'
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
    cameraMetrics: createMemoryStore(),
    vigilanceTests: createMemoryStore(),
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

  const startedAt = clock.now().toISOString()
  const crewService = createCrewService({ crewStore: stores.crew, queue })
  const alertService = createAlertService({ alertStore: stores.alerts, queue, clock, generateId, rules: resolveRules(config.alerts?.rules) })
  // Las reglas de alerta nunca deben impedir que se guarde un registro.
  const evaluate = (entityType, context) => (record) => {
    try {
      alertService.evaluateRecord(entityType, record, context?.(record))
    } catch (err) {
      logger.error(`error evaluando reglas de alerta (${entityType})`, err)
    }
  }
  const telemetryService = createTelemetryService({
    simulator: createTelemetrySimulator({ rng: telemetryRng, clock, generateId }),
    crewService,
    vitalsStore: stores.vitals,
    queue,
    logger,
  })
  const checkInService = createCheckInService({ crewService, checkInStore: stores.checkIns, queue, clock, generateId, onCreated: evaluate('wellness_check_in') })
  // Registros creados por la interfaz a bordo (procesados en el navegador: nunca vídeo).
  const cameraMetricsService = createCrewRecordService({
    crewService,
    store: stores.cameraMetrics,
    queue,
    clock,
    generateId,
    entityType: 'camera_metrics',
    schema: CameraMetricsStrictSchema,
    source: { type: 'camera', simulated: false, deviceId: 'onboard-browser-camera' },
  })
  const vigilanceTestService = createCrewRecordService({
    crewService,
    store: stores.vigilanceTests,
    queue,
    clock,
    generateId,
    entityType: 'vigilance_test',
    schema: VigilanceTestStrictSchema,
    source: { type: 'cognitive_test', simulated: false, deviceId: 'onboard-ui' },
    onCreated: evaluate('vigilance_test', (test) => ({
      previousTests: stores.vigilanceTests.list({ filter: (t) => t.crewMemberId === test.crewMemberId && t.id !== test.id }),
    })),
  })

  const latestOf = (entityType, crewMemberId) => {
    const store = { vital_signs: stores.vitals, wellness_check_in: stores.checkIns }[entityType]
    return store.list({ filter: (r) => r.crewMemberId === crewMemberId, limit: 1 })[0] ?? null
  }
  /** Comprobación de datos ausentes o desactualizados (alertas de calidad de datos). */
  const checkStaleness = () => alertService.checkStaleness({ crew: crewService.list({}), latestOf, since: startedAt })
  let staleTimer = null

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
    services: { crewService, telemetryService, checkInService, alertService, cameraMetricsService, vigilanceTestService },
    checkStaleness,

    /** Arranca la telemetría simulada y el despachador periódicos. */
    start() {
      telemetryService.start(config.telemetry.intervalMs)
      worker.start()
      const every = config.alerts?.staleCheckMs ?? 0
      if (every > 0 && !staleTimer) {
        staleTimer = setInterval(() => {
          try {
            checkStaleness()
          } catch (err) {
            logger.error('error comprobando datos desactualizados', err)
          }
        }, every)
        staleTimer.unref?.()
      }
    },

    /** Detiene temporizadores y listeners, y espera el envío en curso. */
    async stop() {
      telemetryService.stop()
      clearInterval(staleTimer)
      staleTimer = null
      await worker.stop()
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    },
  }
}
