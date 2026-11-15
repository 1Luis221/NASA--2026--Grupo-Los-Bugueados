import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, FlaskConical, Play, Send, Trash2, X } from 'lucide-react'
import { PVT_DEFAULT_PROTOCOL, VigilanceTestSchema } from '@astronaut-wellness/shared'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ErrorState,
  LoadingState,
  PageSection,
  VigilanceTestTable,
  cn,
  formatNumber,
  formatUtc,
  shortId,
  useResource,
} from '@astronaut-wellness/ui'
import { RequireCrew } from '../components/RequireCrew.jsx'
import { SyncStatusLabel } from '../components/SyncStatusLabel.jsx'
import { useOnboard, useOnboardApi, useSyncState } from '../state/app-context.js'
import { deriveSyncStatus } from '../state/sync-index.js'
import { PVT_DEMO_PROTOCOL, classifyResponseEvent, createPvtEngine } from '../vigilance/pvt-engine.js'

const PVT_PROTOCOL_OPTIONS = [
  { id: 'standard', protocol: PVT_DEFAULT_PROTOCOL, label: 'PVT-B · 3 minutos', note: 'Versión breve publicada (Basner et al., 2011).' },
  { id: 'demo', protocol: PVT_DEMO_PROTOCOL, label: 'Demostración · 1 minuto', note: 'NO estándar: solo para probar el flujo.' },
]

const OUTCOME_TEXT = {
  valid: 'Respuesta registrada',
  lapse: 'Lapso (respuesta lenta)',
  false_start: 'Falsa salida (respuesta anticipada)',
  timeout: 'Omisión (sin respuesta)',
}

const ms = (value) => (value === null ? '—' : `${formatNumber(value, { decimals: 0 })} ms`)

function ResultSummary({ result }) {
  const s = result.summary
  const items = [
    ['Ensayos', s.trialCount],
    ['TR medio', ms(s.meanReactionTimeMs)],
    ['TR mediano', ms(s.medianReactionTimeMs)],
    ['10 % más rápidos', ms(s.fastest10PercentMeanMs)],
    ['10 % más lentos', ms(s.slowest10PercentMeanMs)],
    [`Lapsos (≥ ${result.protocol.lapseThresholdMs} ms)`, s.lapseCount],
    [`Falsas salidas (< ${result.protocol.falseStartThresholdMs} ms o sin estímulo)`, s.falseStartCount],
    ['Omisiones', s.timeoutCount],
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2" aria-label="Resultado de la prueba">
      {items.map(([term, value]) => (
        <div key={term} className="flex justify-between gap-3 border-b border-border/60 py-1">
          <dt className="text-muted-foreground">{term}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Vigilance({ member, engineOptions }) {
  const api = useOnboardApi()
  const sync = useSyncState()
  const { devTools } = useOnboard()
  const [optionId, setOptionId] = useState('standard')
  const [automated, setAutomated] = useState(false)
  const automatedRef = useRef(false)
  const [state, setState] = useState({ phase: 'idle', trialCount: 0, lastTrial: null })
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [saved, setSaved] = useState(null)
  const engineRef = useRef(null)
  const option = PVT_PROTOCOL_OPTIONS.find((o) => o.id === optionId)

  const history = useResource(
    `vigilance|${member.id}`,
    async (signal) => ({ ...(await api.listVigilanceTests({ crewMemberId: member.id, limit: 20, signal })), receivedAt: new Date().toISOString() }),
    { keepPreviousData: false },
  )

  const running = state.phase === 'waiting' || state.phase === 'stimulus'

  const start = () => {
    engineRef.current?.dispose()
    setResult(null)
    setSaved(null)
    setSubmitError(null)
    automatedRef.current = false
    setAutomated(false)
    const engine = createPvtEngine({
      protocol: option.protocol,
      ...engineOptions,
      onChange: (next) => {
        setState(next)
        if (next.phase === 'finished') {
          setResult(engine.result())
          setAutomated(automatedRef.current)
        }
      },
    })
    engineRef.current = engine
    engine.start()
  }

  /** Solo cuentan las respuestas de una persona; las de un script, solo en desarrollo y marcadas. */
  const respond = useCallback(
    (event) => {
      const origin = classifyResponseEvent(event, { allowAutomated: devTools })
      if (origin === 'ignored') return
      if (origin === 'automated') automatedRef.current = true
      engineRef.current?.respond()
    },
    [devTools],
  )
  const cancel = () => engineRef.current?.cancel()

  // Barra espaciadora durante la prueba (sin repetición automática del teclado).
  useEffect(() => {
    if (!running) return undefined
    const onKey = (event) => {
      if (event.code !== 'Space' && event.key !== ' ') return
      event.preventDefault()
      if (!event.repeat) respond(event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, respond])

  // Salir de la pantalla cancela la prueba y sus temporizadores.
  useEffect(() => () => engineRef.current?.dispose(), [])

  const submit = async () => {
    if (!result || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { status, body } = await api.submitVigilanceTest({ crewMemberId: member.id, ...result }, { automated })
      const created = VigilanceTestSchema.safeParse(body?.data)
      if (status !== 201 || !created.success) throw new Error(`Se esperaba HTTP 201 con la prueba creada (recibido HTTP ${status}).`)
      setSaved({ test: created.data, savedAt: new Date().toISOString() })
      setResult(null)
      history.reload()
      sync.refresh()
    } catch (error) {
      setSubmitError(error?.message ?? 'Error desconocido')
    } finally {
      setSubmitting(false)
    }
  }

  const discard = () => {
    setResult(null)
    setState({ phase: 'idle', trialCount: 0, lastTrial: null })
  }

  return (
    <div className="space-y-6">
      <Alert>
        <FlaskConical aria-hidden="true" />
        <AlertTitle>Medición descriptiva, no diagnóstico</AlertTitle>
        <AlertDescription>
          La prueba de vigilancia psicomotora mide tiempos de reacción ante un estímulo que aparece a intervalos aleatorios (1–4 s).
          Los resultados dependen del dispositivo y del contexto y no se comparan con normas clínicas. Nada se envía sin que pulses
          «Enviar resultado».
        </AlertDescription>
      </Alert>

      {saved && saved.test.crewMemberId === member.id && (
        <Alert role="status" aria-live="polite">
          <CheckCircle2 aria-hidden="true" className="text-success" />
          <AlertTitle>Resultado guardado en Onboard API</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              Respuesta HTTP 201 a las {formatUtc(saved.savedAt)} · registro <span className="font-mono">{shortId(saved.test.id)}</span>.
              Que la nave lo haya guardado no significa que Tierra ya lo tenga.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">Sincronización con Tierra:</span>
              <SyncStatusLabel derived={deriveSyncStatus({ index: sync.index, snapshot: sync.snapshot, entityId: saved.test.id, existsSince: saved.savedAt })} />
            </div>
          </AlertDescription>
        </Alert>
      )}

      <PageSection title={`Prueba de vigilancia · ${member.name}`}>
        {!running && !result && (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Protocolo</legend>
              {PVT_PROTOCOL_OPTIONS.map((o) => (
                <label key={o.id} className="flex items-start gap-2 text-sm">
                  <input type="radio" name="pvt-protocol" className="mt-1" value={o.id} checked={optionId === o.id} onChange={() => setOptionId(o.id)} />
                  <span>
                    <span className="font-medium">{o.label}</span>
                    <span className="block text-muted-foreground">{o.note}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-sm text-muted-foreground">
              Cuando aparezca el estímulo, pulsa la barra espaciadora o la zona de respuesta lo antes posible. No respondas antes de
              verlo.
            </p>
            <Button type="button" onClick={start}>
              <Play aria-hidden="true" /> Iniciar prueba
            </Button>
            {state.phase === 'cancelled' && <p className="text-sm text-muted-foreground">Prueba cancelada. No se ha guardado nada.</p>}
          </div>
        )}

        {running && (
          <div className="space-y-3">
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault()
                respond(e)
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
              aria-label="Zona de respuesta: pulsa cuando aparezca el estímulo"
              className={cn(
                'flex h-56 w-full select-none items-center justify-center rounded-lg border-2 text-2xl font-semibold transition-none',
                state.phase === 'stimulus' ? 'border-warning bg-warning text-black' : 'border-border bg-muted text-muted-foreground',
              )}
            >
              {state.phase === 'stimulus' ? '¡AHORA!' : 'Espera…'}
            </button>
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span aria-live="polite">
                Ensayos: {state.trialCount}
                {state.lastTrial && (
                  <>
                    {' · Último: '}
                    {OUTCOME_TEXT[state.lastTrial.outcome]}
                    {state.lastTrial.reactionTimeMs !== null && ` (${ms(state.lastTrial.reactionTimeMs)})`}
                  </>
                )}
              </span>
              <Button type="button" variant="outline" onClick={cancel}>
                <X aria-hidden="true" /> Cancelar
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <p className="text-sm">
              Prueba terminada · {result.protocol.name} · {result.protocol.durationSeconds} s
              {result.protocol.name !== PVT_DEFAULT_PROTOCOL.name && ' · protocolo de demostración (no estándar)'}
            </p>
            {automated && (
              <Alert role="status">
                <FlaskConical aria-hidden="true" />
                <AlertTitle>Respuestas automatizadas</AlertTitle>
                <AlertDescription>
                  Las respuestas no las dio una persona (eventos generados por un script, solo admitidos en desarrollo). El resultado se
                  guardará como dato SIMULADO.
                </AlertDescription>
              </Alert>
            )}
            <ResultSummary result={result} />
            {submitError && (
              <Alert variant="destructive" role="alert">
                <AlertTitle>No se pudo enviar el resultado</AlertTitle>
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={submit} disabled={submitting}>
                <Send aria-hidden="true" /> {submitting ? 'Enviando…' : 'Enviar resultado'}
              </Button>
              <Button type="button" variant="outline" onClick={discard} disabled={submitting}>
                <Trash2 aria-hidden="true" /> Descartar
              </Button>
            </div>
          </div>
        )}

        {state.phase === 'finished' && !result && !saved && (
          <p className="text-sm text-muted-foreground">La prueba terminó sin ningún ensayo: no hay resultado que enviar.</p>
        )}
      </PageSection>

      <PageSection title="Historial" description="Guardadas en Onboard API. Cada resultado incluye todos sus ensayos y se verifica al recibirse.">
        {history.loading ? (
          <LoadingState label="Cargando historial…" rows={2} />
        ) : history.error ? (
          <ErrorState message={history.error.message} onRetry={history.reload} />
        ) : (
          <VigilanceTestTable tests={history.data?.data ?? []} caption={`Pruebas de vigilancia de ${member.name}`} emptyDescription="Todavía no has enviado ninguna prueba." />
        )}
      </PageSection>
    </div>
  )
}

/** `engineOptions` permite inyectar reloj, temporizadores y azar en las pruebas. */
export function VigilancePage({ engineOptions } = {}) {
  return <RequireCrew>{(member) => <Vigilance key={member.id} member={member} engineOptions={engineOptions} />}</RequireCrew>
}
