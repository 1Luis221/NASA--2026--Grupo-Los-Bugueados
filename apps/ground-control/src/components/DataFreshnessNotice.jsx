import { CloudOff, History, X } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle, Button, formatNumber, formatUtc } from '@astronaut-wellness/ui'
import { useRealtimeStatus, useSyncOverview } from '../realtime/realtime-context.js'

/**
 * Avisos de vigencia de los datos mostrados:
 * - Sin conexión en tiempo real: los datos pueden estar desactualizados.
 * - Reinicio de Ground API detectado: se descartaron los datos anteriores del
 *   navegador y solo se muestra lo que Ground API conserva.
 */
export function DataFreshnessNotice() {
  const { status, lastConnectedAt } = useRealtimeStatus()
  const { reset, dismissReset } = useSyncOverview()
  const offline = status === 'reconnecting' || status === 'disconnected'

  return (
    <div className="space-y-3 empty:hidden">
      {offline && (
        <Alert>
          <CloudOff aria-hidden="true" />
          <AlertTitle>Sin conexión en tiempo real con Ground API</AlertTitle>
          <AlertDescription>
            Los datos mostrados pueden estar desactualizados.{' '}
            {lastConnectedAt ? `Última conexión: ${formatUtc(lastConnectedAt)}.` : 'Aún no se ha establecido la conexión.'}
          </AlertDescription>
        </Alert>
      )}
      {reset && (
        <Alert>
          <History aria-hidden="true" />
          <AlertTitle>Ground API se ha reiniciado</AlertTitle>
          <AlertDescription>
            <p>
              Su contador de eventos procesados volvió a empezar ({formatNumber(reset.previousProcessedEvents)} →{' '}
              {formatNumber(reset.processedEvents)}). Como guarda los datos en memoria, se descartaron{' '}
              {formatNumber(reset.discarded)} registros que este navegador conservaba y ahora solo se muestra lo que Ground API
              tiene. Detectado: {formatUtc(reset.detectedAt)}.
            </p>
            <Button type="button" variant="outline" size="sm" className="mt-2" onClick={dismissReset}>
              <X aria-hidden="true" />
              Entendido
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
