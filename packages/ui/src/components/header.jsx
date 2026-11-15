import { Menu } from 'lucide-react'
import { Button } from '@astronaut-wellness/ui/components/ui/button'
import { cn } from '@astronaut-wellness/ui/lib/utils'

/**
 * Encabezado de la vista: título, contexto y acciones. En pantallas pequeñas
 * muestra el botón que abre el menú lateral (`onMenuClick`).
 */
export function Header({
  title,
  description,
  actions,
  onMenuClick,
  menuOpen = false,
  menuControls,
  menuButtonRef,
  className,
  ...props
}) {
  return (
    <header
      data-slot="header"
      className={cn(
        'sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background/95 px-4 py-3 backdrop-blur sm:flex-nowrap sm:px-6',
        className,
      )}
      {...props}
    >
      {onMenuClick && (
        <Button
          ref={menuButtonRef}
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
          aria-label="Abrir menú de navegación"
          aria-expanded={menuOpen}
          aria-controls={menuControls}
        >
          <Menu aria-hidden="true" />
        </Button>
      )}
      <div className="min-w-0 flex-1">
        {title && <h1 className="truncate text-lg font-semibold sm:text-xl">{title}</h1>}
        {description && <p className="truncate text-sm text-muted-foreground">{description}</p>}
      </div>
      {/* En móvil las acciones pasan a una segunda fila para no truncar el título. */}
      {actions && <div className="flex w-full shrink-0 items-center gap-2 sm:w-auto">{actions}</div>}
    </header>
  )
}
