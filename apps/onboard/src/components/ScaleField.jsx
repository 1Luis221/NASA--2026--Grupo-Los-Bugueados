import { useId } from 'react'
import { cn } from '@astronaut-wellness/ui'

const VALUES = [1, 2, 3, 4, 5]

/**
 * Escala Likert 1–5 con radios nativos (navegables con flechas) y el
 * significado de sus extremos siempre visible.
 */
export function ScaleField({ name, label, low, high, value, onChange, error, disabled }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    // radiogroup (en lugar de group) admite aria-required y aria-invalid según ARIA 1.2.
    <fieldset
      role="radiogroup"
      className="space-y-2"
      aria-describedby={cn(hintId, error && errorId)}
      aria-required="true"
      aria-invalid={error ? true : undefined}
      data-field={name}
    >
      <legend className="text-sm font-medium">{label}</legend>
      <p id={hintId} className="text-xs text-muted-foreground">
        1 = {low} · 5 = {high}
      </p>
      <div className="grid grid-cols-5 gap-2">
        {VALUES.map((n) => (
          <label
            key={n}
            className={cn(
              'flex h-11 cursor-pointer items-center justify-center rounded-md border text-base font-medium tabular-nums transition-colors',
              'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring',
              // border-input: borde de control con contraste ≥ 3:1 (WCAG 1.4.11).
              value === n ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-accent',
              error && value !== n && 'border-destructive',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              disabled={disabled}
              className="sr-only"
            />
            {n}
            {(n === 1 || n === 5) && (
              <>
                {' '}
                <span className="sr-only">({n === 1 ? low : high})</span>
              </>
            )}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
