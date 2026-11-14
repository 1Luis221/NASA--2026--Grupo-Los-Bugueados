import { SYNC_ENTITY_TYPES } from '@astronaut-wellness/shared'
import { loadConfig } from './config.js'
import { createLogger, systemClock } from './lib/runtime.js'
import { nullNotifier } from './realtime/notifier.js'
import { createMemoryStore } from './repositories/memory-store.js'
import { createSyncLog } from './repositories/sync-log.js'
import { createRecordsService } from './services/records.service.js'
import { createSyncReceiver } from './services/sync-receiver.service.js'

/**
 * Compone los módulos de tierra. Todo vive en memoria: se pierde al reiniciar.
 * Las dependencias (reloj, logger, notificador) se pueden sustituir en pruebas.
 */
export function createGroundContext({
  config = loadConfig(),
  clock = systemClock,
  logger = createLogger(config.serviceName),
  notifier = nullNotifier,
} = {}) {
  const recordStores = Object.fromEntries(SYNC_ENTITY_TYPES.map((type) => [type, createMemoryStore()]))
  const syncLog = createSyncLog({ rejectedLogSize: config.rejectedLogSize })

  return {
    config,
    clock,
    logger,
    recordStores,
    syncLog,
    services: {
      syncReceiver: createSyncReceiver({ recordStores, syncLog, notifier, clock, logger }),
      recordsService: createRecordsService({ recordStores, syncLog }),
    },
  }
}
