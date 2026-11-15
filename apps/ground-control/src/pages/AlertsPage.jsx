import { useId, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ALERT_SEVERITIES, ALERT_STATUSES } from '@astronaut-wellness/shared'
import {
  ALERT_SEVERITY_LABELS,
  ALERT_STATUS_LABELS,
  AlertList,
  ErrorState,
  Label,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@astronaut-wellness/ui'
import { CrewLink } from '../components/CrewLink.jsx'
import { useRealtimeCollection } from '../realtime/realtime-context.js'

const ALL = 'all'

function FilterSelect({ label, value, onChange, options, labels, allLabel }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {labels[option]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/** Alertas recibidas por Ground API (solo lectura: la API no permite modificarlas). */
export function AlertsPage() {
  const [params, setParams] = useSearchParams()
  const status = ALERT_STATUSES.includes(params.get('status')) ? params.get('status') : ALL
  const severity = ALERT_SEVERITIES.includes(params.get('severity')) ? params.get('severity') : ALL

  const setFilter = (name) => (value) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === ALL) next.delete(name)
        else next.set(name, value)
        return next
      },
      { replace: true },
    )

  const query = { limit: 500, ...(status !== ALL && { status }), ...(severity !== ALL && { severity }) }
  const alerts = useRealtimeCollection('alert', query)
  const crew = useRealtimeCollection('crew_member')
  const crewById = useMemo(() => new Map(crew.records.map((c) => [c.id, c])), [crew.records])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4" role="search" aria-label="Filtrar alertas">
        <FilterSelect
          label="Estado"
          value={status}
          onChange={setFilter('status')}
          options={ALERT_STATUSES}
          labels={ALERT_STATUS_LABELS}
          allLabel="Todos los estados"
        />
        <FilterSelect
          label="Severidad"
          value={severity}
          onChange={setFilter('severity')}
          options={ALERT_SEVERITIES}
          labels={ALERT_SEVERITY_LABELS}
          allLabel="Todas las severidades"
        />
        <p className="pb-2 text-sm text-muted-foreground" aria-live="polite">
          {alerts.loading ? 'Cargando…' : `${alerts.records.length} ${alerts.records.length === 1 ? 'alerta' : 'alertas'}`}
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Las alertas se gestionan a bordo; Ground API no permite reconocerlas ni resolverlas desde tierra.
      </p>

      {alerts.error && <ErrorState message={alerts.error.message} onRetry={alerts.reload} />}
      {alerts.loading ? (
        <LoadingState label="Cargando alertas…" />
      ) : (
        !alerts.error && (
          <AlertList
            alerts={alerts.records}
            caption="Alertas recibidas por Ground API"
            renderCrew={(id) => <CrewLink id={id} crewById={crewById} />}
            emptyDescription={
              status !== ALL || severity !== ALL ? 'Ninguna alerta coincide con los filtros.' : 'Ground API no ha recibido alertas.'
            }
          />
        )
      )}
    </div>
  )
}
