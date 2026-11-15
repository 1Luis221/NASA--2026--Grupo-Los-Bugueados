import { Skeleton } from '@astronaut-wellness/ui/components/ui/skeleton'
import { cn } from '@astronaut-wellness/ui/lib/utils'

/** Estado de carga accesible: anuncia el mensaje y muestra filas esqueleto. */
export function LoadingState({ label = 'Cargando…', rows = 3, className, ...props }) {
  return (
    <div role="status" aria-live="polite" data-slot="loading-state" className={cn('space-y-3', className)} {...props}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} aria-hidden="true" className="h-10 w-full" />
      ))}
    </div>
  )
}
