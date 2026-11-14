import { truncate } from '../lib/runtime.js'

const toErrorInfo = (err) => ({
  code: truncate(String(err.code ?? 'UNKNOWN_ERROR'), 50),
  message: truncate(String(err.message || 'Error desconocido'), 500),
})

/**
 * Despachador de la cola: envía los eventos pendientes a Ground API a través
 * del enlace simulado y procesa los SyncAck.
 *
 * - accepted / duplicate → acknowledged (duplicate = tierra ya lo tenía).
 * - rejected             → failed, sin reintento (el contrato lo prohíbe sin cambios).
 * - error recuperable    → retry_scheduled con backoff; agota intentos → failed.
 * - enlace desconectado  → no se intenta nada: los eventos siguen en la cola.
 *
 * `flush()` es idempotente mientras hay un envío en curso (devuelve la misma
 * promesa), así que el temporizador, la reconexión y los tests no se solapan.
 */
export function createSyncWorker({ queue, link, groundClient, logger, batchSize = 50, intervalMs = 0 }) {
  let inFlight = null
  let timer = null

  async function sendOne(event) {
    const sending = queue.markSending(event.id)
    let ack
    try {
      ack = await link.transmit(() => groundClient.sendEvent(sending))
    } catch (err) {
      if (err.retryable === false) {
        queue.markFailed(sending.id, toErrorInfo(err))
        logger.error(`evento #${sending.sequence} no recuperable: ${err.code}`)
        return 'failed'
      }
      const updated = queue.markRetry(sending.id, toErrorInfo(err))
      logger.warn(`evento #${sending.sequence} intento ${sending.attempts} falló (${err.code}) → ${updated.status}`)
      return updated.status === 'failed' ? 'failed' : 'retry'
    }

    if (ack.eventId !== sending.id || ack.sequence !== sending.sequence) {
      queue.markRetry(sending.id, { code: 'ACK_MISMATCH', message: 'El SyncAck no corresponde al evento enviado' })
      return 'retry'
    }
    if (ack.result === 'rejected') {
      queue.markFailed(sending.id, ack.error ?? { code: 'REJECTED', message: 'Rechazado por Ground API' })
      logger.error(`evento #${sending.sequence} rechazado por tierra: ${ack.error?.code}`)
      return 'rejected'
    }
    queue.markAcknowledged(sending.id)
    return ack.result
  }

  async function run() {
    const summary = { skipped: false, sent: 0, accepted: 0, duplicate: 0, rejected: 0, retry: 0, failed: 0 }
    if (link.getStatus().state === 'disconnected') return { ...summary, skipped: true }

    for (const event of queue.listDue({ limit: batchSize })) {
      const outcome = await sendOne(event)
      summary.sent += 1
      summary[outcome] += 1
      // Un fallo recuperable suele indicar problemas de enlace: se espera al siguiente ciclo.
      if (outcome === 'retry') break
    }
    return summary
  }

  function flush() {
    inFlight ??= run().finally(() => {
      inFlight = null
    })
    return inFlight
  }

  function start() {
    if (timer || intervalMs <= 0) return
    timer = setInterval(() => {
      flush().catch((err) => logger.error('error en el despachador de sincronización', err))
    }, intervalMs)
  }

  /** Detiene el temporizador y espera a que termine el envío en curso. */
  async function stop() {
    clearInterval(timer)
    timer = null
    await inFlight?.catch(() => {})
  }

  return { flush, start, stop, isRunning: () => timer !== null }
}
