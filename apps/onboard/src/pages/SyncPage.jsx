import { CheckCircle2, Clock, Hourglass, RefreshCw, Send, XCircle } from 'lucide-react'
import {
  Button,
  ENTITY_TYPE_LABELS,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  PageSection,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  formatNumber,
  formatUtc,
  labelFor,
} from '@astronaut-wellness/ui'
import { LinkStatus, SIMULATED_LINK_NOTE } from '../components/LinkStatus.jsx'
import { SyncStatusLabel } from '../components/SyncStatusLabel.jsx'
import { useSyncState } from '../state/app-context.js'
import { latestSyncError } from '../state/sync-index.js'

const COUNTERS = [
  ['pending', 'Pendientes', Hourglass],
  ['sending', 'Enviando', Send],
  ['retry_scheduled', 'Reintento programado', RefreshCw],
  ['acknowledged', 'Recibidos por Tierra (con acuse)', CheckCircle2],
  ['failed', 'Fallidos', XCircle],
]

function LinkSection() {
  const { link, dispatcherRunning, updatedAt } = useSyncState()
  const latency = link ? link.latencyMs + (link.state === 'degraded' ? link.degradedLatencyMs : 0) : null
  return (
    <PageSection title="Enlace nave–Tierra (simulado)" description={SIMULATED_LINK_NOTE}>
      <div className="space-y-3 text-sm">
        <LinkStatus />
        {link && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
            <dt className="text-muted-foreground">Latencia simulada aplicada</dt>
            <dd className="tabular-nums">
              {formatNumber(latency)} ms
              {link.state === 'degraded' && ` (${formatNumber(link.latencyMs)} base + ${formatNumber(link.degradedLatencyMs)} por degradación)`}
            </dd>
            <dt className="text-muted-foreground">Pérdida simulada en modo degradado</dt>
            <dd className="tabular-nums">{formatNumber(link.degradedFailureRate * 100, { decimals: 0 })} %</dd>
            <dt className="text-muted-foreground">Fallos transitorios inyectados pendientes</dt>
            <dd className="tabular-nums">{link.pendingFailures}</dd>
            <dt className="text-muted-foreground">Último cambio de estado</dt>
            <dd>{formatUtc(link.changedAt)}</dd>
            <dt className="text-muted-foreground">Despachador de envíos</dt>
            <dd>{dispatcherRunning ? 'En marcha (envío automático)' : 'Detenido (solo envío manual)'}</dd>
            <dt className="text-muted-foreground">Última actualización</dt>
            <dd>{formatUtc(updatedAt)}</dd>
          </dl>
        )}
      </div>
    </PageSection>
  )
}

function QueueSection() {
  const { queue, index } = useSyncState()
  const lastError = latestSyncError(index)
  const waiting = (index?.events ?? []).slice().sort((a, b) => a.sequence - b.sequence)

  return (
    <PageSection title="Cola de sincronización" description="Eventos de la nave hacia Ground API, por estado.">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {COUNTERS.map(([key, label, icon]) => (
            <MetricCard key={key} label={label} value={queue?.byStatus[key]} icon={icon} />
          ))}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Último error disponible</h3>
          {lastError ? (
            <p className="text-sm">
              <span className="font-mono">{lastError.lastError.code}</span> — {lastError.lastError.message} (evento #{lastError.sequence},
              intento {lastError.attempts} de {lastError.maxAttempts}, {formatUtc(lastError.updatedAt)})
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Ningún evento pendiente tiene errores registrados.</p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Eventos sin acuse de Ground API</h3>
          {!index ? (
            <LoadingState label="Cargando eventos…" rows={2} />
          ) : waiting.length === 0 ? (
            <EmptyState icon={Clock} title="Nada pendiente" description="Todos los eventos tienen acuse de Ground API." />
          ) : (
            <Table>
              <TableCaption>Eventos pendientes, en envío, con reintento programado o fallidos</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Secuencia</TableHead>
                  <TableHead scope="col">Tipo</TableHead>
                  <TableHead scope="col">Estado</TableHead>
                  <TableHead scope="col">Intentos</TableHead>
                  <TableHead scope="col">Próximo reintento (UTC)</TableHead>
                  <TableHead scope="col">Último error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waiting.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="tabular-nums">#{event.sequence}</TableCell>
                    <TableCell>{labelFor(ENTITY_TYPE_LABELS, event.entityType)}</TableCell>
                    <TableCell>
                      <SyncStatusLabel derived={{ state: event.status, evidence: 'event', event }} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {event.attempts} / {event.maxAttempts}
                    </TableCell>
                    <TableCell>{formatUtc(event.nextRetryAt)}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal">
                      {event.lastError ? `${event.lastError.code}: ${event.lastError.message}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </PageSection>
  )
}

export function SyncPage() {
  const { loading, error, link, refresh } = useSyncState()
  if (loading && !link) return <LoadingState label="Consultando el estado de sincronización…" rows={4} />
  return (
    <div className="space-y-6">
      {error && <ErrorState title="No se pudo consultar Onboard API" message={error.message} onRetry={refresh} />}
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={refresh}>
          <RefreshCw aria-hidden="true" />
          Actualizar ahora
        </Button>
      </div>
      <LinkSection />
      <QueueSection />
    </div>
  )
}
