import { useId, useRef, useState } from 'react'
import { Activity, Send, Unplug, Zap } from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
  LINK_STATE_LABELS,
  Label,
  PageSection,
  formatNumber,
  labelFor,
} from '@astronaut-wellness/ui'
import { LINK_STATES } from '@astronaut-wellness/shared'
import { LinkStatus, SIMULATED_LINK_NOTE } from '../components/LinkStatus.jsx'
import { useOnboardApi, useSyncState } from '../state/app-context.js'

/** Texto del resultado real devuelto por cada endpoint /api/dev. */
const describe = {
  link: (data) =>
    `Enlace simulado: ${labelFor(LINK_STATE_LABELS, data.state).toLowerCase()} · latencia base ${data.latencyMs} ms · degradación +${data.degradedLatencyMs} ms · pérdida en modo degradado ${formatNumber(data.degradedFailureRate * 100, { decimals: 0 })} %.`,
  failures: (data) => `Fallos transitorios pendientes de aplicar: ${data.pendingFailures}.`,
  tick: (data, count) => `Se generaron ${count} lecturas simuladas (una por tripulante activo); se encolaron para Tierra.`,
  flush: (data) =>
    data.skipped
      ? 'Envío omitido: el enlace simulado está desconectado. Los eventos siguen en la cola.'
      : `Enviados ${data.sent}: ${data.accepted} aceptados, ${data.duplicate} duplicados, ${data.rejected} rechazados, ${data.retry} con reintento, ${data.failed} fallidos.`,
}

/** Controles de demostración (solo en desarrollo) sobre los endpoints /api/dev existentes. */
export function SimulationPage() {
  const api = useOnboardApi()
  const { link, refresh } = useSyncState()
  const formId = useId()
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [latency, setLatency] = useState({ latencyMs: '', degradedLatencyMs: '', degradedFailureRate: '' })
  const [failures, setFailures] = useState('1')
  const busyRef = useRef(false)

  async function run(name, label, operation, describeResult) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(name)
    setResult(null)
    setFieldErrors({})
    try {
      const payload = await operation()
      setResult({ ok: true, label, text: describeResult(payload?.data, payload?.count) })
    } catch (error) {
      if (error?.status === 400) setFieldErrors(Object.fromEntries(error.issues.map((i) => [i.path || '_form', i.message])))
      setResult({ ok: false, label, text: `${error.message}${error.status ? ` (HTTP ${error.status})` : ''}` })
    } finally {
      busyRef.current = false
      setBusy(null)
      refresh()
    }
  }

  const setState = (state) => run(`state-${state}`, `Cambiar enlace a ${LINK_STATE_LABELS[state].toLowerCase()}`, () => api.dev.updateLink({ state }), describe.link)

  const submitLatency = (event) => {
    event.preventDefault()
    // Solo se envían los campos rellenados; la API exige al menos uno y valida rangos (400 por campo).
    const changes = Object.fromEntries(
      Object.entries(latency)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => [k, Number(v)]),
    )
    if (Object.keys(changes).length === 0) {
      setFieldErrors({ _form: 'Indica al menos un valor.' })
      return
    }
    run('latency', 'Configurar latencia y pérdidas', () => api.dev.updateLink(changes), describe.link)
  }

  const disabled = busy !== null
  const field = (key, label, hint, props) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${formId}-${key}`}>{label}</Label>
      <Input
        id={`${formId}-${key}`}
        type="number"
        value={latency[key]}
        onChange={(e) => setLatency((l) => ({ ...l, [key]: e.target.value }))}
        aria-invalid={fieldErrors[key] ? true : undefined}
        aria-describedby={`${formId}-${key}-hint`}
        disabled={disabled}
        {...props}
      />
      <p id={`${formId}-${key}-hint`} className="text-xs text-muted-foreground">
        {fieldErrors[key] ? <span className="text-destructive">{fieldErrors[key]}</span> : hint}
      </p>
    </div>
  )

  return (
    <div className="space-y-6">
      <Alert>
        <Zap aria-hidden="true" />
        <AlertTitle>Controles de simulación (solo en desarrollo)</AlertTitle>
        <AlertDescription>
          Actúan sobre el simulador de Onboard API para la demostración. {SIMULATED_LINK_NOTE} No están disponibles en producción.
        </AlertDescription>
      </Alert>

      <div role="status" aria-live="polite" className="empty:hidden">
        {result && (
          <Alert variant={result.ok ? 'default' : 'destructive'}>
            <AlertTitle>
              {result.label}: {result.ok ? 'completado' : 'error'}
            </AlertTitle>
            <AlertDescription>{result.text}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PageSection title="Estado del enlace" description="Cambia el estado del enlace simulado.">
          <div className="space-y-4">
            <LinkStatus />
            <div role="group" aria-label="Estado del enlace simulado" className="flex flex-wrap gap-2">
              {LINK_STATES.map((state) => (
                <Button
                  key={state}
                  type="button"
                  variant={link?.state === state ? 'default' : 'outline'}
                  aria-pressed={link?.state === state}
                  disabled={disabled}
                  onClick={() => setState(state)}
                >
                  {state === 'disconnected' && <Unplug aria-hidden="true" />}
                  {busy === `state-${state}` ? 'Aplicando…' : LINK_STATE_LABELS[state]}
                </Button>
              ))}
            </div>
          </div>
        </PageSection>

        <PageSection title="Latencia y pérdidas" description="PUT /api/dev/link. Deja vacío lo que no quieras cambiar.">
          <form onSubmit={submitLatency} noValidate className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {field('latencyMs', 'Latencia base (ms)', `0–60 000. Actual: ${link?.latencyMs ?? '—'}`, { min: 0, max: 60000, step: 1 })}
              {field('degradedLatencyMs', 'Latencia extra en modo degradado (ms)', `0–60 000. Actual: ${link?.degradedLatencyMs ?? '—'}`, {
                min: 0,
                max: 60000,
                step: 1,
              })}
              {field('degradedFailureRate', 'Probabilidad de pérdida (0–1)', `Actual: ${link?.degradedFailureRate ?? '—'}`, {
                min: 0,
                max: 1,
                step: 0.05,
              })}
            </div>
            {fieldErrors._form && <p className="text-sm text-destructive">{fieldErrors._form}</p>}
            <Button type="submit" variant="outline" disabled={disabled}>
              {busy === 'latency' ? 'Aplicando…' : 'Aplicar'}
            </Button>
          </form>
        </PageSection>

        <PageSection title="Fallos transitorios" description="Los próximos N envíos fallarán y se reintentarán con backoff.">
          <form
            noValidate
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              run('failures', 'Inyectar fallos transitorios', () => api.dev.injectFailures(Number(failures)), describe.failures)
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-failures`}>Número de fallos (1–100)</Label>
              <Input
                id={`${formId}-failures`}
                type="number"
                min={1}
                max={100}
                className="w-32"
                value={failures}
                onChange={(e) => setFailures(e.target.value)}
                aria-invalid={fieldErrors.count ? true : undefined}
                disabled={disabled}
              />
              {fieldErrors.count && <p className="text-sm text-destructive">{fieldErrors.count}</p>}
            </div>
            <Button type="submit" variant="outline" disabled={disabled}>
              {busy === 'failures' ? 'Aplicando…' : 'Simular fallos'}
            </Button>
          </form>
        </PageSection>

        <PageSection title="Telemetría y envío" description="Acciones explícitas: la interfaz nunca genera datos por sí sola.">
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => run('tick', 'Generar telemetría', () => api.dev.tickTelemetry(), describe.tick)}
            >
              <Activity aria-hidden="true" />
              {busy === 'tick' ? 'Generando…' : 'Generar una medición simulada'}
            </Button>
            <Button type="button" variant="outline" disabled={disabled} onClick={() => run('flush', 'Forzar envío', () => api.dev.flushSync(), describe.flush)}>
              <Send aria-hidden="true" />
              {busy === 'flush' ? 'Enviando…' : 'Forzar envío de pendientes'}
            </Button>
          </div>
        </PageSection>
      </div>
    </div>
  )
}
