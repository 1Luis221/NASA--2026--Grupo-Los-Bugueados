import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@astronaut-wellness/ui/components/ui/alert'
import { Button } from '@astronaut-wellness/ui/components/ui/button'
import { cn } from '@astronaut-wellness/ui/lib/utils'

/**
 * Error con opción de reintento. Usa role="alert" (vía Alert) para que los
 * lectores de pantalla lo anuncien al aparecer.
 */
export function ErrorState({
  title = 'No se pudieron cargar los datos',
  message,
  onRetry,
  retrying = false,
  retryLabel = 'Reintentar',
  className,
  ...props
}) {
  return (
    <Alert variant="destructive" data-slot="error-state" className={cn('', className)} {...props}>
      <AlertTriangle aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {message && <p>{message}</p>}
        {onRetry && (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry} disabled={retrying}>
            <RefreshCw aria-hidden="true" className={cn(retrying && 'animate-spin')} />
            {retrying ? 'Reintentando…' : retryLabel}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
