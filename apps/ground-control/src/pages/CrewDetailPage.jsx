import { ArrowLeft, Camera } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { idSchema } from '@astronaut-wellness/shared'
import {
  AlertList,
  Badge,
  Button,
  CREW_STATUS_LABELS,
  CheckInTable,
  EmptyState,
  ErrorState,
  LoadingState,
  ROLE_LABELS,
  SourceBadge,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  VitalSignsChart,
  VitalSignsSummary,
  WellnessSummary,
  formatMeasurement,
  formatNumber,
  formatUtc,
  labelFor,
  resolveCrewMember,
} from '@astronaut-wellness/ui'
import { PageSection } from '@astronaut-wellness/ui'
import { useRealtimeCollection } from '../realtime/realtime-context.js'

function Profile({ member }) {
  const rows = member.known
    ? [
        ['Nombre', member.name],
        ['Indicativo', member.callsign ?? '—'],
        ['Rol', labelFor(ROLE_LABELS, member.role)],
        ['Agencia', member.agency ?? '—'],
        ['Estado', labelFor(CREW_STATUS_LABELS, member.status)],
      ]
    : []
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
      <dt className="text-muted-foreground">Identificador</dt>
      <dd className="font-mono break-all">{member.id}</dd>
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      {!member.known && (
        <>
          <dt className="text-muted-foreground">Perfil</dt>
          <dd>
            <Badge variant="outline">No recibido por Ground API</Badge>
          </dd>
        </>
      )}
    </dl>
  )
}

function CameraMetricsTable({ metrics }) {
  return (
    <Table>
      <TableCaption>Métricas agregadas de cámara (sin imágenes)</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Fin de ventana (UTC)</TableHead>
          <TableHead scope="col">Ventana</TableHead>
          <TableHead scope="col">Rostro detectado</TableHead>
          <TableHead scope="col">Parpadeo</TableHead>
          <TableHead scope="col">Ojos cerrados</TableHead>
          <TableHead scope="col">Bostezos</TableHead>
          <TableHead scope="col">Origen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((m) => (
          <TableRow key={m.id}>
            <TableCell>{formatUtc(m.recordedAt)}</TableCell>
            <TableCell>{formatMeasurement(m.windowDuration)}</TableCell>
            <TableCell>{m.faceDetected ? 'Sí' : 'No'}</TableCell>
            <TableCell>{formatMeasurement(m.blinkRate)}</TableCell>
            <TableCell>{m.eyeClosureRatio ? `${formatNumber(m.eyeClosureRatio.value * 100, { decimals: 0 })} % de la ventana` : '—'}</TableCell>
            <TableCell>{formatMeasurement(m.yawnCount)}</TableCell>
            <TableCell>
              <SourceBadge source={m.source} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function CrewDetailPage() {
  const { id } = useParams()
  const validId = idSchema.safeParse(id).success
  return validId ? (
    <CrewDetail id={id} />
  ) : (
    <EmptyState
      title="Identificador de tripulante no válido"
      description="La dirección no contiene un UUID válido."
      action={
        <Button asChild variant="outline" size="sm">
          <Link to="/crew">Volver a la tripulación</Link>
        </Button>
      }
    />
  )
}

function CrewDetail({ id }) {
  const crew = useRealtimeCollection('crew_member')
  const vitals = useRealtimeCollection('vital_signs', { crewMemberId: id, limit: 100 })
  const checkIns = useRealtimeCollection('wellness_check_in', { crewMemberId: id, limit: 50 })
  const camera = useRealtimeCollection('camera_metrics', { crewMemberId: id, limit: 50 })
  const alerts = useRealtimeCollection('alert', { crewMemberId: id, limit: 500 })

  const collections = [crew, vitals, checkIns, camera, alerts]
  const member = resolveCrewMember(id, new Map(crew.records.map((c) => [c.id, c])))
  const loading = collections.some((c) => c.loading)
  const error = collections.find((c) => c.error)?.error
  const reload = () => Promise.all(collections.map((c) => c.reload()))
  const hasAnyData = member.known || vitals.records.length + checkIns.records.length + alerts.records.length > 0

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/crew">
          <ArrowLeft aria-hidden="true" />
          Tripulación
        </Link>
      </Button>

      <h2 className="text-xl font-semibold">{member.displayName}</h2>

      {error && <ErrorState message={error.message} onRetry={reload} />}
      {loading && !hasAnyData ? (
        <LoadingState label="Cargando datos del tripulante…" rows={4} />
      ) : !hasAnyData && !error ? (
        <EmptyState title="Sin datos de este tripulante" description="Ground API no tiene perfil, mediciones, autoevaluaciones ni alertas para este identificador." />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <PageSection title="Perfil">
            <Profile member={member} />
          </PageSection>

          <PageSection title="Última medición" description="Valores recibidos con su unidad. Sin rangos de normalidad.">
            <VitalSignsSummary reading={vitals.records[0]} emptyDescription="Ground API no ha recibido constantes de este tripulante." />
          </PageSection>

          <PageSection title="Historial de signos vitales" description={`Hasta ${100} lecturas más recientes.`} className="xl:col-span-2">
            <VitalSignsChart readings={vitals.records} />
          </PageSection>

          <PageSection title="Autoevaluaciones" className="xl:col-span-2">
            <div className="space-y-4">
              <WellnessSummary checkIns={checkIns.records} />
              <CheckInTable checkIns={checkIns.records} caption={`Autoevaluaciones de ${member.displayName}`} />
            </div>
          </PageSection>

          <PageSection title="Alertas relacionadas">
            <AlertList
              alerts={alerts.records}
              showCrew={false}
              caption={`Alertas de ${member.displayName}`}
              emptyDescription="No hay alertas asociadas a este tripulante."
            />
          </PageSection>

          <PageSection title="Cámara" description="Métricas agregadas de análisis facial.">
            {camera.records.length === 0 ? (
              <EmptyState
                icon={Camera}
                title="Sin métricas de cámara"
                description="Ground API no ha recibido métricas de cámara de este tripulante. El análisis por cámara a bordo aún no está implementado."
              />
            ) : (
              <CameraMetricsTable metrics={camera.records} />
            )}
          </PageSection>
        </div>
      )}
    </div>
  )
}
