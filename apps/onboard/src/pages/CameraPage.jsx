import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Cpu, FlaskConical, ShieldCheck, Square } from 'lucide-react'
import { CameraMetricsSchema } from '@astronaut-wellness/shared'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  CameraMetricsTable,
  ErrorState,
  Label,
  LoadingState,
  PageSection,
  StatusIndicator,
  formatNumber,
  formatUtc,
  shortId,
  useResource,
} from '@astronaut-wellness/ui'
import { FACE_MODEL_INFO, describeModelOrigin } from '../camera/landmarker.js'
import { useFaceAnalysis } from '../camera/use-face-analysis.js'
import { RequireCrew } from '../components/RequireCrew.jsx'
import { SyncStatusLabel } from '../components/SyncStatusLabel.jsx'
import { useOnboardApi, useSyncState } from '../state/app-context.js'
import { deriveSyncStatus } from '../state/sync-index.js'

const WINDOW_OPTIONS_SECONDS = [15, 30, 60]

const STATUS_VIEW = {
  idle: { tone: 'neutral', label: 'Cámara apagada' },
  requesting: { tone: 'info', label: 'Esperando permiso del navegador…' },
  'loading-model': { tone: 'info', label: 'Cargando el modelo de visión…' },
  running: { tone: 'success', label: 'Analizando en este dispositivo' },
  stopped: { tone: 'neutral', label: 'Cámara detenida y liberada' },
  error: { tone: 'danger', label: 'Error' },
}

const pct = (value) => (value === null || value === undefined ? '—' : `${formatNumber(value * 100, { decimals: 0 })} %`)
const deg = (value) => `${formatNumber(value, { decimals: 0 })}°`

function LiveMetrics({ live, windowSeconds }) {
  if (!live) return <p className="text-sm text-muted-foreground">Las cifras aparecerán cuando el modelo procese los primeros fotogramas.</p>
  const items = [
    ['Rostro ahora', live.faceNow ? 'Detectado' : 'No detectado'],
    ['Rostro en la ventana', pct(live.faceRatio)],
    ['Parpadeos', `${live.blinks}${live.blinkRate !== null ? ` (${formatNumber(live.blinkRate, { decimals: 0 })}/min)` : ''}`],
    ['Ojos cerrados', pct(live.eyeClosureRatio)],
    ['Posibles bostezos', String(live.yawns)],
    ['Cabeza (cabeceo/giro/inclinación)', live.headPose ? `${deg(live.headPose.pitch)} / ${deg(live.headPose.yaw)} / ${deg(live.headPose.roll)}` : '—'],
    ['Ventana actual', `${formatNumber(live.elapsedMs / 1000, { decimals: 0 })} de ${windowSeconds} s`],
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2" aria-label="Métricas en vivo">
      {items.map(([term, value]) => (
        <div key={term} className="flex justify-between gap-3 border-b border-border/60 py-1">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function CameraAnalysis({ member, analysisOptions }) {
  const api = useOnboardApi()
  const sync = useSyncState()
  const [windowSeconds, setWindowSeconds] = useState(30)
  const [sendEnabled, setSendEnabled] = useState(false)
  const [sent, setSent] = useState([]) // { metrics, savedAt } de esta sesión
  const [localOnly, setLocalOnly] = useState(0)
  const [sendError, setSendError] = useState(null)
  const sendRef = useRef(sendEnabled)
  const memberRef = useRef(member)
  useEffect(() => {
    sendRef.current = sendEnabled
    memberRef.current = member
  })

  const history = useResource(
    `camera|${member.id}`,
    async (signal) => ({ ...(await api.listCameraMetrics({ crewMemberId: member.id, limit: 20, signal })), receivedAt: new Date().toISOString() }),
    { keepPreviousData: false },
  )

  const handleWindow = async (metrics) => {
    // Sin consentimiento explícito, la ventana se descarta: no sale nada del dispositivo.
    if (!sendRef.current) {
      setLocalOnly((n) => n + 1)
      return
    }
    try {
      const { status, body } = await api.submitCameraMetrics({ crewMemberId: memberRef.current.id, ...metrics })
      const created = CameraMetricsSchema.safeParse(body?.data)
      if (status !== 201 || !created.success) throw new Error(`Se esperaba HTTP 201 con las métricas creadas (recibido HTTP ${status}).`)
      setSendError(null)
      setSent((list) => [{ metrics: created.data, savedAt: new Date().toISOString() }, ...list].slice(0, 10))
      history.reload()
      sync.refresh()
    } catch (error) {
      setSendError(error?.message ?? 'Error desconocido')
    }
  }

  const { videoRef, canvasRef, status, error, live, engine, start, stop } = useFaceAnalysis({
    windowMs: windowSeconds * 1000,
    onWindow: handleWindow,
    ...analysisOptions,
  })
  const active = status === 'requesting' || status === 'loading-model' || status === 'running'
  const view = STATUS_VIEW[status]

  return (
    <div className="space-y-6">
      <Alert>
        <ShieldCheck aria-hidden="true" />
        <AlertTitle>Privacidad: el vídeo no sale de este dispositivo</AlertTitle>
        <AlertDescription>
          La imagen se procesa en el navegador con MediaPipe Face Landmarker. No se graba, no se guarda y nunca se envía: ni vídeo,
          ni fotogramas, ni puntos del rostro. Solo si marcas «Enviar métricas agregadas» se mandan a Onboard API las cifras
          resumidas de cada ventana. Al detener o salir de esta pantalla, la cámara se apaga.
        </AlertDescription>
      </Alert>

      <Alert>
        <FlaskConical aria-hidden="true" />
        <AlertTitle>Métricas experimentales, no diagnósticas</AlertTitle>
        <AlertDescription>
          Dependen de la iluminación, el encuadre y el modelo. Los umbrales (ojo cerrado, boca abierta) son de procesamiento de señal y
          no tienen significado clínico. Modelo: {FACE_MODEL_INFO.name} {FACE_MODEL_INFO.version}, {describeModelOrigin()}.
        </AlertDescription>
      </Alert>

      <PageSection title={`Análisis facial · ${member.name}`}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border bg-muted">
              <video
                ref={videoRef}
                className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
                muted
                playsInline
                aria-label="Vista previa local de la cámara"
              />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100 object-cover" aria-hidden="true" />
              {!active && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
                  <CameraOff aria-hidden="true" className="size-8" />
                  <span className="text-sm">Cámara apagada</span>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {active ? (
                <Button type="button" variant="outline" onClick={stop}>
                  <Square aria-hidden="true" /> Detener cámara
                </Button>
              ) : (
                <Button type="button" onClick={start}>
                  <Camera aria-hidden="true" /> Activar cámara
                </Button>
              )}
              <StatusIndicator tone={view.tone} label={view.label} />
              {status === 'running' && engine?.delegate && <span className="text-xs text-muted-foreground">Procesamiento: {engine.delegate}</span>}
            </div>
            {status === 'running' && engine?.delegate === 'CPU' && (
              <Alert role="status">
                <Cpu aria-hidden="true" />
                <AlertTitle>Procesando con CPU</AlertTitle>
                <AlertDescription>
                  La GPU no estaba disponible para el modelo, así que se usa la CPU (más lento, mismos resultados).
                  {engine.fallbackReason && <span className="block text-xs">Motivo: {engine.fallbackReason}</span>}
                </AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive" role="alert">
                <CameraOff aria-hidden="true" />
                <AlertTitle>No se pudo iniciar el análisis</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label htmlFor="camera-window">Ventana de agregación</Label>
                <select
                  id="camera-window"
                  className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-60"
                  value={windowSeconds}
                  disabled={active}
                  onChange={(e) => setWindowSeconds(Number(e.target.value))}
                >
                  {WINDOW_OPTIONS_SECONDS.map((s) => (
                    <option key={s} value={s}>
                      {s} s
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={sendEnabled} onChange={(e) => setSendEnabled(e.target.checked)} />
                Enviar métricas agregadas a Onboard API
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {sendEnabled
                ? 'Al cerrar cada ventana se enviarán solo sus cifras agregadas, que se sincronizarán con Tierra.'
                : `Modo solo local: las ventanas se calculan y se descartan${localOnly ? ` (${localOnly} descartada${localOnly === 1 ? '' : 's'})` : ''}.`}
            </p>
            <LiveMetrics live={status === 'running' ? live : null} windowSeconds={windowSeconds} />
          </div>
        </div>
      </PageSection>

      {(sent.length > 0 || sendError) && (
        <PageSection title="Ventanas enviadas en esta sesión">
          {sendError && (
            <Alert variant="destructive" role="alert" className="mb-3">
              <AlertTitle>No se pudo enviar la última ventana</AlertTitle>
              <AlertDescription>{sendError}</AlertDescription>
            </Alert>
          )}
          <ul className="space-y-2 text-sm" aria-label="Ventanas enviadas">
            {sent.map(({ metrics, savedAt }) => (
              <li key={metrics.id} className="flex flex-wrap items-center gap-2">
                <span>
                  HTTP 201 · {formatUtc(savedAt)} · registro <span className="font-mono">{shortId(metrics.id)}</span>
                </span>
                <SyncStatusLabel derived={deriveSyncStatus({ index: sync.index, snapshot: sync.snapshot, entityId: metrics.id, existsSince: savedAt })} />
              </li>
            ))}
          </ul>
        </PageSection>
      )}

      <PageSection title="Historial de métricas" description="Guardadas en Onboard API. Solo cifras agregadas por ventana.">
        {history.loading ? (
          <LoadingState label="Cargando historial…" rows={2} />
        ) : history.error ? (
          <ErrorState message={history.error.message} onRetry={history.reload} />
        ) : (
          <CameraMetricsTable
            metrics={history.data?.data ?? []}
            caption={`Métricas de cámara de ${member.name} (sin imágenes)`}
            emptyDescription="Todavía no se ha enviado ninguna ventana."
          />
        )}
      </PageSection>
    </div>
  )
}

/** `analysisOptions` permite inyectar dependencias del navegador en las pruebas. */
export function CameraPage({ analysisOptions } = {}) {
  return <RequireCrew>{(member) => <CameraAnalysis key={member.id} member={member} analysisOptions={analysisOptions} />}</RequireCrew>
}
