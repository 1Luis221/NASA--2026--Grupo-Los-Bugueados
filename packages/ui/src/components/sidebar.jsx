import { X } from 'lucide-react'
import { Button } from '@astronaut-wellness/ui/components/ui/button'
import { cn } from '@astronaut-wellness/ui/lib/utils'

/**
 * Menú lateral independiente del router. Con React Router se pasa
 * `linkComponent={NavLink}`: NavLink añade aria-current="page" al enlace
 * activo y el estilo se basa en ese atributo. Con enlaces <a> se usa `activePath`.
 */
export function Sidebar({
  id,
  brand,
  items = [],
  linkComponent: LinkComponent = 'a',
  activePath,
  footer,
  label = 'Navegación principal',
  onNavigate,
  onClose,
  className,
  ...props
}) {
  const BrandIcon = brand?.icon

  return (
    <aside
      id={id}
      data-slot="sidebar"
      className={cn('flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground', className)}
      {...props}
    >
      <div className="flex items-center gap-3 px-4 py-4">
        {BrandIcon && (
          <span className="flex size-9 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <BrandIcon aria-hidden="true" className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{brand?.name}</p>
          {brand?.subtitle && <p className="truncate text-xs text-muted-foreground">{brand.subtitle}</p>}
        </div>
        {onClose && (
          <Button type="button" variant="ghost" size="icon-sm" className="lg:hidden" onClick={onClose} aria-label="Cerrar menú de navegación">
            <X aria-hidden="true" />
          </Button>
        )}
      </div>

      <nav aria-label={label} className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="space-y-1">
          {items.map(({ to, label: itemLabel, icon: Icon, end }) => {
            const linkProps =
              LinkComponent === 'a'
                ? { href: to, 'aria-current': activePath === to ? 'page' : undefined }
                : { to, end }
            return (
              <li key={to}>
                <LinkComponent
                  {...linkProps}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/85 transition-colors',
                    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
                    'aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground',
                  )}
                >
                  {Icon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
                  <span className="truncate">{itemLabel}</span>
                </LinkComponent>
              </li>
            )
          })}
        </ul>
      </nav>

      {footer && <div className="border-t border-sidebar-border px-4 py-3 text-xs text-muted-foreground">{footer}</div>}
    </aside>
  )
}
