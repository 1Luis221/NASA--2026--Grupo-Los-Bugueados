import { Bell, Clock, Database, UserRound, UserRoundX } from 'lucide-react'
import {
  CheckInTable,
  EmptyState,
  ErrorState,
  LoadingState,
  MetricCard,
  SourceBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  WellnessSummary,
  formatRelative,
  formatUtc,
  formatVitalSign,
  shortId,
} from '@astronaut-wellness/ui'
import { CrewLink } from '../components/CrewLink.jsx'
import { PageSection } from '@astronaut-wellness/ui'
import { useCrewDirectory } from '../hooks/use-crew-directory.js'
import { useNow } from '@astronaut-wellness/ui'
import { useRealtimeStatus, useSyncOverview } from '../realtime/realtime-context.js'

const VITAL_COLUMNS = [
  ['heartRate', 'FC'],
  ['oxygenSaturation', 'SpO₂'],
  ['bodyTemperature', 'Temperatura'],
  ['bloodPressure', 'Presión arterial'],
]

export function DashboardPage() {
  const directory = useCrewDirectory()
  const { stats, lastReceivedAt } = useSyncOverview()
  const { lastEventAt } = useRealtimeStatus()
  const now = useNow()
  const { members, crewById, latestReadings, crew, checkIns, activeAlerts } = directory

  if (directory.loading && members.length === 0) return <LoadingState label="Cargando datos de Ground API…" rows={4} />
  if (directory.error && members.length === 0) {
    return <ErrorState message={directory.error.message} onRetry={directory.reload} />
  }

  const unknown = members.filter((m) => !m.known)
  const latest = [...latestReadings.values()].sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
  const lastUpdate = [lastEventAt, lastReceivedAt].filter(Boolean).sort().at(-1)
  const nothingReceived = members.length === 0 && checkIns.records.length === 0 && activeAlerts.records.length === 0

  return (
    <div className="space-y-6">
      {directory.error && <ErrorState title="Algunos datos no se pudieron actualizar" message={directory.error.message} onRetry={directory.reload} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Tripulantes conocidos" value={crew.records.length} icon={UserRound} hint="Perfiles recibidos por Ground API" />
        <MetricCard
          label="Tripulantes desconocidos"
          value={unknown.length}
          icon={UserRoundX}
          hint={unknown.length ? `Solo identificador: ${unknown.map((m) => shortId(m.id)).join(', ')}` : 'Todos los identificadores tienen perfil'}
        />
        <MetricCard label="Alertas activas" value={activeAlerts.records.length} icon={Bell} />
        <MetricCard label="Eventos recibidos" value={stats?.accepted} icon={Database} hint="Aceptados por Ground API desde su arranque" />
        <MetricCard
          label="Último dato recibido"
          value={lastReceivedAt ? formatRelative(lastReceivedAt, { now }) : null}
          icon={Clock}
          hint={lastReceivedAt ? formatUtc(lastReceivedAt) : 'Ground API no ha recibido eventos'}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Última actualización de esta vista: {lastUpdate ? formatUtc(lastUpdate) : 'sin datos todavía'}. La antigüedad del último
        dato es informativa: no indica por sí sola el estado del enlace nave–Tierra.
      </p>

      {nothingReceived ? (
        <EmptyState
          title="Ground API todavía no ha recibido datos"
          description="Cuando la nave sincronice tripulación, mediciones o autoevaluaciones aparecerán aquí sin recargar la página."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
          <PageSection title="Últimas constantes vitales" description="Lectura más reciente de cada tripulante, con su unidad y origen.">
            {latest.length === 0 ? (
              <EmptyState title="Sin mediciones" description="Ground API no ha recibido constantes vitales." />
            ) : (
              <Table>
                <TableCaption>Última lectura por tripulante (hora en UTC)</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Tripulante</TableHead>
                    <TableHead scope="col">Hora</TableHead>
                    {VITAL_COLUMNS.map(([key, label]) => (
                      <TableHead key={key} scope="col">
                        {label}
                      </TableHead>
                    ))}
                    <TableHead scope="col">Origen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {latest.map((reading) => (
                    <TableRow key={reading.id}>
                      <TableCell>
                        <CrewLink id={reading.crewMemberId} crewById={crewById} />
                      </TableCell>
                      <TableCell>
                        <time dateTime={reading.recordedAt}>{formatUtc(reading.recordedAt).slice(11, 19)}</time>
                      </TableCell>
                      {VITAL_COLUMNS.map(([key]) => (
                        <TableCell key={key} className="tabular-nums">
                          {formatVitalSign(reading, key)}
                        </TableCell>
                      ))}
                      <TableCell>
                        <SourceBadge source={reading.source} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </PageSection>

          <PageSection title="Bienestar autoinformado" description="Medias descriptivas de las autoevaluaciones recibidas.">
            <WellnessSummary checkIns={checkIns.records} />
          </PageSection>

          <PageSection title="Últimas autoevaluaciones" className="2xl:col-span-2">
            <CheckInTable
              checkIns={checkIns.records.slice(0, 5)}
              caption="Cinco autoevaluaciones más recientes"
              renderCrew={(id) => <CrewLink id={id} crewById={crewById} />}
            />
          </PageSection>
        </div>
      )}
    </div>
  )
}
