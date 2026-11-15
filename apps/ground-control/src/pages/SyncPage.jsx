import { CheckCircle2, Copy, Database, Hash, XCircle } from 'lucide-react'
import {
  ENTITY_TYPE_LABELS,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  OPERATION_LABELS,
  StatusIndicator,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  formatRelative,
  formatUtc,
  labelFor,
  shortId,
  useResource,
} from '@astronaut-wellness/ui'
import { PageSection } from '@astronaut-wellness/ui'
import { RealtimeStatus } from '../components/RealtimeStatus.jsx'
import { useNow } from '@astronaut-wellness/ui'
import { useGroundApi, useRealtimeStatus, useSyncOverview } from '../realtime/realtime-context.js'

const SOCKET_STATUS_TEXT = {
  connected: 'Este navegador recibe actualizaciones en tiempo real de Ground API.',
  connecting: 'Estableciendo la conexión en tiempo real con Ground API…',
  reconnecting: 'Conexión en tiempo real interrumpida; reintentando automáticamente.',
  disconnected: 'Sin conexión en tiempo real con Ground API.',
}

function ReceivedData() {
  const api = useGroundApi()
  const { stats, error } = useSyncOverview()
  const { dataEpoch } = useRealtimeStatus()
  const events = useResource(`sync-events|${dataEpoch}`, (signal) => api.listSyncEvents({ limit: 20, signal }), {
    pollIntervalMs: 5000,
  })

  return (
    <PageSection title="A · Datos recibidos" description="Estadísticas reales de Ground API desde su último arranque (GET /api/sync/stats).">
      <div className="space-y-6">
        {error && !stats && <ErrorState message={error.message} />}
        {!stats && !error && <LoadingState label="Cargando estadísticas…" rows={2} />}
        {stats && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Aceptados" value={stats.accepted} icon={CheckCircle2} />
            <MetricCard label="Duplicados" value={stats.duplicate} icon={Copy} hint="Reenvíos ya procesados (idempotencia)" />
            <MetricCard label="Rechazados" value={stats.rejected} icon={XCircle} />
            <MetricCard label="Eventos procesados" value={stats.processedEvents} icon={Database} />
            <MetricCard label="Última secuencia de la nave" value={stats.lastSequenceByOrigin?.onboard} icon={Hash} />
          </div>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Eventos recientes</h3>
          {events.loading ? (
            <LoadingState label="Cargando eventos…" rows={2} />
          ) : events.error ? (
            <ErrorState message={events.error.message} onRetry={events.reload} />
          ) : events.isEmpty ? (
            <EmptyState title="Sin eventos" description="Ground API no ha recibido eventos de sincronización." />
          ) : (
            <Table>
              <TableCaption>Últimos {events.data.count} eventos aplicados por Ground API</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Secuencia</TableHead>
                  <TableHead scope="col">Tipo</TableHead>
                  <TableHead scope="col">Operación</TableHead>
                  <TableHead scope="col">Evento</TableHead>
                  <TableHead scope="col">Recibido (UTC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.data.data.map((e) => (
                  <TableRow key={e.eventId}>
                    <TableCell className="tabular-nums">#{e.sequence}</TableCell>
                    <TableCell>{labelFor(ENTITY_TYPE_LABELS, e.entityType)}</TableCell>
                    <TableCell>{labelFor(OPERATION_LABELS, e.operation)}</TableCell>
                    <TableCell className="font-mono text-xs" title={e.eventId}>
                      {shortId(e.eventId)}
                    </TableCell>
                    <TableCell>{formatUtc(e.receivedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Rechazos recientes</h3>
          {stats?.recentRejections?.length ? (
            <Table>
              <TableCaption>Eventos rechazados por incumplir el contrato</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Secuencia</TableHead>
                  <TableHead scope="col">Código</TableHead>
                  <TableHead scope="col">Motivo</TableHead>
                  <TableHead scope="col">Recibido (UTC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentRejections.map((r) => (
                  <TableRow key={`${r.eventId}-${r.receivedAt}`}>
                    <TableCell className="tabular-nums">#{r.sequence}</TableCell>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell className="max-w-96 whitespace-normal">{r.message}</TableCell>
                    <TableCell>{formatUtc(r.receivedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{stats ? 'Ningún evento rechazado.' : '—'}</p>
          )}
        </div>
      </div>
    </PageSection>
  )
}

function BrowserConnection() {
  const { status, lastConnectedAt, lastEventAt, lastError } = useRealtimeStatus()
  return (
    <PageSection title="B · Conexión de este navegador" description="Socket.IO entre el navegador y Ground API.">
      <div className="space-y-3 text-sm">
        <RealtimeStatus />
        <p>{SOCKET_STATUS_TEXT[status]}</p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Última conexión</dt>
          <dd>{formatUtc(lastConnectedAt)}</dd>
          <dt className="text-muted-foreground">Último evento en tiempo real</dt>
          <dd>{formatUtc(lastEventAt)}</dd>
          {lastError && (
            <>
              <dt className="text-muted-foreground">Último error</dt>
              <dd className="font-mono text-xs">{lastError}</dd>
            </>
          )}
        </dl>
        <p className="text-xs text-muted-foreground">Esta conexión no dice nada sobre el enlace entre la nave y la Tierra.</p>
      </div>
    </PageSection>
  )
}

function SpaceLink() {
  const { lastReceivedAt } = useSyncOverview()
  const now = useNow()
  return (
    <PageSection title="C · Enlace nave–Tierra">
      <div className="space-y-3 text-sm">
        <StatusIndicator tone="neutral" label="Estado del enlace no verificable desde Tierra" />
        <p>
          Ground API solo recibe lo que la nave envía: no puede saber si el enlace está conectado, degradado o caído. El estado
          real del enlace se consulta a bordo.
        </p>
        <p className="text-muted-foreground">
          Información complementaria — último dato recibido:{' '}
          {lastReceivedAt ? (
            <>
              <time dateTime={lastReceivedAt}>{formatUtc(lastReceivedAt)}</time> ({formatRelative(lastReceivedAt, { now })})
            </>
          ) : (
            'ninguno'
          )}
          . La ausencia de datos recientes puede deberse a un corte del enlace, a que la nave no genere datos o a un reinicio; no
          se infiere automáticamente.
        </p>
      </div>
    </PageSection>
  )
}

export function SyncPage() {
  return (
    <div className="space-y-6">
      <ReceivedData />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BrowserConnection />
        <SpaceLink />
      </div>
    </div>
  )
}
