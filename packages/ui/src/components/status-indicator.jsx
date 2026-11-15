import { cn } from '@astronaut-wellness/ui/lib/utils'

const TONES = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  info: 'bg-info',
  neutral: 'bg-muted-foreground',
}

/**
 * Indicador de estado: punto de color + texto. El significado nunca depende
 * solo del color (WCAG 1.4.1): `label` siempre se muestra o se anuncia.
 */
export function StatusIndicator({ tone = 'neutral', label, pulse = false, hideLabel = false, className, ...props }) {
  return (
    <span data-slot="status-indicator" data-tone={tone} className={cn('inline-flex items-center gap-2 text-sm', className)} {...props}>
      <span aria-hidden="true" className="relative flex size-2.5">
        {pulse && (
          <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', TONES[tone])} />
        )}
        <span className={cn('relative inline-flex size-2.5 rounded-full', TONES[tone])} />
      </span>
      <span className={cn(hideLabel && 'sr-only')}>{label}</span>
    </span>
  )
}
