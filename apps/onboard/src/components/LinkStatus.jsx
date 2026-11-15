import { LINK_STATE_LABELS, LINK_STATE_TONES, StatusIndicator, labelFor } from '@astronaut-wellness/ui'
import { useSyncState } from '../state/app-context.js'

export const SIMULATED_LINK_NOTE =
  'Estado del simulador de enlace de Onboard API (entorno de demostración). No es una conexión espacial real.'

/**
 * Estado del enlace nave–Tierra SIMULADO, siempre con texto.
 * `live`: anuncia los cambios a lectores de pantalla (usar en una sola instancia, la del encabezado).
 */
export function LinkStatus({ className, live = false }) {
  const { link, error } = useSyncState()
  const liveProps = live ? { role: 'status', 'aria-live': 'polite' } : {}
  if (error && !link) return <StatusIndicator tone="danger" label="Enlace: sin datos de Onboard API" className={className} {...liveProps} />
  if (!link) return <StatusIndicator tone="neutral" label="Enlace simulado: consultando…" className={className} {...liveProps} />
  return (
    <StatusIndicator
      tone={LINK_STATE_TONES[link.state] ?? 'neutral'}
      label={`Enlace simulado: ${labelFor(LINK_STATE_LABELS, link.state).toLowerCase()}`}
      title={SIMULATED_LINK_NOTE}
      className={className}
      {...liveProps}
    />
  )
}
