import { CheckCircle2 } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle, LINK_STATE_LABELS, formatUtc, labelFor, shortId } from '@astronaut-wellness/ui'
import { useSyncState } from '../state/app-context.js'
import { deriveSyncStatus } from '../state/sync-index.js'
import { SyncStatusLabel } from './SyncStatusLabel.jsx'

/** Explicación comprensible de cada estado y de la evidencia en que se basa. */
function syncExplanation(derived, link) {
  const { state, event, verifiedAt, reason } = derived
  switch (state) {
    case 'checking':
      return 'Comprobando el estado en la cola de sincronización de la nave…'
    case 'pending':
      return link?.state === 'disconnected'
        ? 'Está en la cola local de la nave. El enlace simulado está desconectado: se enviará automáticamente al reconectar.'
        : 'Está en la cola local de la nave y se enviará automáticamente.'
    case 'sending':
      return 'Se está enviando a Ground API.'
    case 'retry_scheduled':
      return `Un intento de envío falló (${event.lastError?.code}). Próximo reintento: ${formatUtc(event.nextRetryAt)}.`
    case 'failed':
      return `No se pudo entregar (${event?.lastError?.code ?? 'error'}). Requiere intervención.`
    case 'acknowledged':
      return `Confirmado: a las ${formatUtc(verifiedAt)} la cola de la nave no tenía ningún evento sin acuse de Ground API, así que este registro ya fue recibido en Tierra.`
    default:
      return reason === 'partial-query'
        ? 'No aparece entre los pendientes consultados, pero la consulta disponible puede estar incompleta (más de 500 eventos). Se confirmará cuando la cola no tenga eventos sin acuse.'
        : 'Ya no figura como pendiente, pero la cola tiene otros eventos sin acuse y la recepción todavía no se puede verificar. Se confirmará automáticamente.'
  }
}

/**
 * Confirmación tras un 201: separa "guardada en Onboard API" de "recibida por
 * Tierra". El segundo estado solo se afirma con evidencia verificable.
 */
export function CheckInReceipt({ checkIn, savedAt }) {
  const { index, snapshot, link } = useSyncState()
  const derived = deriveSyncStatus({ index, snapshot, entityId: checkIn.id, existsSince: savedAt })

  return (
    <Alert role="status" aria-live="polite">
      <CheckCircle2 aria-hidden="true" className="text-success" />
      <AlertTitle>Autoevaluación guardada en Onboard API</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Respuesta HTTP 201 a las {formatUtc(savedAt)} · registro <span className="font-mono">{shortId(checkIn.id)}</span>. Que la
          nave la haya guardado no significa que Tierra ya la tenga.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">Sincronización con Tierra:</span>
          <SyncStatusLabel derived={derived} />
        </div>
        <p>{syncExplanation(derived, link)}</p>
        {link && <p className="text-xs">Enlace simulado: {labelFor(LINK_STATE_LABELS, link.state).toLowerCase()}.</p>}
      </AlertDescription>
    </Alert>
  )
}
