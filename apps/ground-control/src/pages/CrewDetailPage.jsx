import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { idSchema } from '@astronaut-wellness/shared'
import {
  AlertList,
  CameraMetricsTable,
  Badge,
  Button,
  CREW_STATUS_LABELS,
  CheckInTable,
  DimensionPanel,
  EmptyState,
  ErrorState,
  LoadingState,
  ROLE_LABELS,
  VigilanceTestTable,
  VitalSignsChart,
  VitalSignsSummary,
  WellnessSummary,
  buildFatigueIndicators,
  buildStressIndicators,
  labelFor,
  resolveCrewMember,
  useNow,
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
  const vigilance = useRealtimeCollection('vigilance_test', { crewMemberId: id, limit: 50 })
  const alerts = useRealtimeCollection('alert', { crewMemberId: id, limit: 500 })

  const collections = [crew, vitals, checkIns, camera, vigilance, alerts]
  const member = resolveCrewMember(id, new Map(crew.records.map((c) => [c.id, c])))
  const loading = collections.some((c) => c.loading)
  const error = collections.find((c) => c.error)?.error
  const reload = () => Promise.all(collections.map((c) => c.reload()))
  const hasAnyData =
    member.known || vitals.records.length + checkIns.records.length + alerts.records.length + camera.records.length + vigilance.records.length > 0
  const now = useNow(30_000)
  const sources = { vitals: vitals.records, checkIns: checkIns.records, cameraMetrics: camera.records, vigilanceTests: vigilance.records }

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

          <PageSection
            title="Fatiga"
            description="Indicadores descriptivos con su fuente y fecha: sueño, somnolencia y fatiga autodeclaradas, rendimiento en la PVT y métricas faciales experimentales. No es un diagnóstico ni una puntuación combinada."
            className="xl:col-span-2"
          >
            <DimensionPanel indicators={buildFatigueIndicators(sources)} now={now} label={`Indicadores de fatiga de ${member.displayName}`} />
          </PageSection>

          <PageSection
            title="Respuesta al estrés"
            description="Frecuencia cardiaca, HRV y actividad del sensor (simulados en esta demo) junto al estrés percibido. Se muestran por separado: no se combinan ni se interpretan clínicamente."
            className="xl:col-span-2"
          >
            <DimensionPanel indicators={buildStressIndicators(sources)} now={now} label={`Indicadores de respuesta al estrés de ${member.displayName}`} />
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

          <PageSection
            title="Vigilancia cognitiva (PVT)"
            description="Tiempos de reacción de la prueba realizada a bordo. Resultados descriptivos y verificables, sin interpretación clínica."
            className="xl:col-span-2"
          >
            <VigilanceTestTable
              tests={vigilance.records}
              caption={`Pruebas de vigilancia de ${member.displayName}`}
              emptyDescription="Ground API no ha recibido pruebas de vigilancia de este tripulante desde que se inició (los datos se guardan en memoria y se pierden al reiniciar las API)."
            />
          </PageSection>

          <PageSection
            title="Cámara"
            description="Métricas faciales experimentales, agregadas por ventana a bordo (nunca imágenes)."
            className="xl:col-span-2"
          >
            <CameraMetricsTable
              metrics={camera.records}
              caption={`Métricas de cámara de ${member.displayName}`}
              emptyDescription="Ground API no ha recibido métricas de cámara de este tripulante desde que se inició (los datos se guardan en memoria y se pierden al reiniciar las API). Solo llegan si a bordo se activa «Enviar métricas agregadas»."
            />
          </PageSection>
        </div>
      )}
    </div>
  )
}
