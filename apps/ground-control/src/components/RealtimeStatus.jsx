import { StatusIndicator } from '@astronaut-wellness/ui'
import { useRealtimeStatus } from '../realtime/realtime-context.js'

const PRESENTATION = {
  connected: { tone: 'success', label: 'Tiempo real: conectado' },
  connecting: { tone: 'neutral', label: 'Tiempo real: conectando…' },
  reconnecting: { tone: 'warning', label: 'Tiempo real: reconectando…' },
  disconnected: { tone: 'danger', label: 'Tiempo real: desconectado' },
}

/**
 * Estado de la conexión Socket.IO navegador ↔ Ground API.
 * No es el estado del enlace nave–Tierra (Ground API no puede verificarlo).
 */
export function RealtimeStatus({ live = false }) {
  const { status } = useRealtimeStatus()
  const { tone, label } = PRESENTATION[status] ?? PRESENTATION.disconnected
  return (
    <StatusIndicator
      tone={tone}
      label={label}
      title="Conexión en tiempo real (Socket.IO) entre este navegador y Ground API. No indica el estado del enlace nave–Tierra."
      // Anuncia reconexiones/cortes; solo en la instancia del encabezado para no duplicar el aviso.
      {...(live && { role: 'status', 'aria-live': 'polite' })}
    />
  )
}
