import { useEffect, useId, useRef, useState } from 'react'
import { cn } from '@astronaut-wellness/ui/lib/utils'
import { Header } from './header.jsx'
import { Sidebar } from './sidebar.jsx'

/** Punto de corte `lg` de Tailwind: a partir de aquí el menú es fijo. */
const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * Estructura de página: enlace "saltar al contenido", menú lateral (fijo en
 * escritorio, panel desplegable en móvil/tablet), encabezado y contenido.
 *
 * En móvil el menú cerrado queda `invisible`: fuera del orden de tabulación y
 * del árbol de accesibilidad. Escape lo cierra y el foco vuelve al botón.
 */
export function AppShell({ sidebar, header, children, className }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const sidebarId = useId()
  const mainId = useId()
  const sidebarRef = useRef(null)
  const menuButtonRef = useRef(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    let frame
    if (menuOpen) {
      // En el mismo instante el navegador hace visible el panel y aplica `inert` al
      // contenido; Chromium descarta un focus() inmediato. Se aplaza al siguiente fotograma.
      const schedule = window.requestAnimationFrame ?? ((fn) => setTimeout(fn, 16))
      frame = schedule(() => sidebarRef.current?.querySelector('a, button')?.focus())
    } else if (wasOpen.current) {
      menuButtonRef.current?.focus()
    }
    wasOpen.current = menuOpen
    return () => {
      if (frame !== undefined) (window.cancelAnimationFrame ?? clearTimeout)(frame)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKeyDown = (event) => event.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKeyDown)
    // Si la ventana pasa a escritorio (menú fijo), el panel móvil deja de tener sentido.
    const desktop = typeof window.matchMedia === 'function' ? window.matchMedia(DESKTOP_QUERY) : null
    const onDesktop = (event) => event.matches && setMenuOpen(false)
    desktop?.addEventListener?.('change', onDesktop)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      desktop?.removeEventListener?.('change', onDesktop)
    }
  }, [menuOpen])

  const close = () => setMenuOpen(false)

  return (
    <div data-slot="app-shell" className={cn('flex min-h-svh bg-background', className)}>
      <a
        href={`#${mainId}`}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>

      {menuOpen && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={close}
        />
      )}

      <div
        ref={sidebarRef}
        className={cn(
          'fixed inset-y-0 left-0 z-40 transition-transform lg:visible lg:sticky lg:top-0 lg:h-svh lg:translate-x-0',
          menuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
        )}
      >
        <Sidebar {...sidebar} id={sidebarId} onNavigate={close} onClose={close} />
      </div>

      {/* Con el panel móvil abierto, el contenido de detrás no es alcanzable con el tabulador (inert). */}
      <div className="flex min-w-0 flex-1 flex-col" inert={menuOpen || undefined}>
        <Header
          {...header}
          onMenuClick={() => setMenuOpen(true)}
          menuOpen={menuOpen}
          menuControls={sidebarId}
          menuButtonRef={menuButtonRef}
        />
        <main id={mainId} tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
