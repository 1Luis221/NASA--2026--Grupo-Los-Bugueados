import { API_PREFIX, SyncAckSchema } from '@astronaut-wellness/shared'
import { truncate } from '../lib/runtime.js'

/** Error al hablar con Ground API. `retryable` decide si se reintenta. */
export class GroundClientError extends Error {
  constructor(code, message, { retryable }) {
    super(message)
    this.name = 'GroundClientError'
    this.code = code
    this.retryable = retryable
  }
}

/** Estados HTTP con los que Ground API responde un SyncAck. */
const ACK_STATUSES = new Set([200, 201, 422])

/**
 * Cliente HTTP hacia Ground API (POST /api/sync/events).
 * Devuelve el SyncAck validado (modo tolerante: es un dato ENTRANTE).
 */
export function createGroundClient({ baseUrl, timeoutMs = 5000, fetchImpl = globalThis.fetch }) {
  const url = new URL(`${API_PREFIX}/sync/events`, baseUrl)

  async function sendEvent(event) {
    let response
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      const code = err.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK_ERROR'
      throw new GroundClientError(code, truncate(err.message || code, 500), { retryable: true })
    }

    const body = await response.json().catch(() => null)

    if (ACK_STATUSES.has(response.status)) {
      const ack = SyncAckSchema.safeParse(body)
      if (ack.success) return ack.data
      throw new GroundClientError('INVALID_ACK', 'Ground API devolvió un SyncAck inválido', { retryable: true })
    }

    const retryable = response.status >= 500 || response.status === 429
    const message = typeof body?.error === 'string' ? body.error : `HTTP ${response.status}`
    throw new GroundClientError(`HTTP_${response.status}`, truncate(message, 500), { retryable })
  }

  return { sendEvent }
}
