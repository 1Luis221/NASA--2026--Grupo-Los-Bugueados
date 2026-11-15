import { SYNC_STATUS_LABELS, SYNC_STATUS_TONES, StatusIndicator, labelFor } from '@astronaut-wellness/ui'

const EXTRA = {
  checking: { tone: 'neutral', label: 'Comprobando…' },
  unverified: { tone: 'neutral', label: 'Sin confirmación verificable' },
}

/**
 * Estado de sincronización de un registro (resultado de deriveSyncStatus).
 * "Recibido por Tierra" solo aparece con evidencia; si no la hay, se dice.
 */
export function SyncStatusLabel({ derived }) {
  const state = derived?.state ?? 'checking'
  const { tone, label } = EXTRA[state] ?? { tone: SYNC_STATUS_TONES[state] ?? 'neutral', label: labelFor(SYNC_STATUS_LABELS, state) }
  return <StatusIndicator tone={tone} label={label} />
}
