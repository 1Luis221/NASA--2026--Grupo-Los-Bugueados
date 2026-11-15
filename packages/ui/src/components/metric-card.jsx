import { Card, CardContent, CardHeader, CardTitle } from '@astronaut-wellness/ui/components/ui/card'
import { cn } from '@astronaut-wellness/ui/lib/utils'

const isMissing = (value) => value === null || value === undefined || value === ''

/**
 * Tarjeta de indicador. Si `value` no existe muestra "—" y anuncia
 * "Sin datos": nunca se rellena con valores inventados.
 */
export function MetricCard({ label, value, unit, icon: Icon, hint, footer, className, ...props }) {
  const missing = isMissing(value)

  return (
    <Card data-slot="metric-card" className={cn('gap-3 py-5', className)} {...props}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-5">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        {Icon && <Icon aria-hidden="true" className="size-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent className="px-5">
        <p className="flex items-baseline gap-1.5">
          {missing ? (
            <>
              <span aria-hidden="true" className="text-3xl font-semibold tabular-nums text-muted-foreground">
                —
              </span>
              <span className="sr-only">Sin datos</span>
            </>
          ) : (
            <>
              <span className="text-3xl font-semibold tabular-nums">{value}</span>
              {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
            </>
          )}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        {footer && <div className="mt-3">{footer}</div>}
      </CardContent>
    </Card>
  )
}
