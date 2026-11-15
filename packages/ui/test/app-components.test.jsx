import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Activity, HeartPulse, LayoutDashboard, Satellite } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { AppShell, EmptyState, ErrorState, LoadingState, MetricCard, Sidebar, StatusIndicator } from '../src/index.js'

const brand = { name: 'Astronaut Wellness System', subtitle: 'Ground Control', icon: Satellite }
const items = [
  { to: '/', label: 'Panel principal', icon: LayoutDashboard },
  { to: '/vitals', label: 'Signos vitales', icon: HeartPulse },
]

function renderShell() {
  return render(
    <AppShell sidebar={{ brand, items, activePath: '/' }} header={{ title: 'Panel principal', description: 'Contexto' }}>
      <p>Contenido de la vista</p>
    </AppShell>,
  )
}

describe('AppShell', () => {
  it('tiene landmarks, encabezado y enlace para saltar al contenido', () => {
    renderShell()
    expect(screen.getByRole('navigation', { name: 'Navegación principal' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Panel principal' })).toBeInTheDocument()

    const main = screen.getByRole('main')
    expect(main).toHaveTextContent('Contenido de la vista')
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', `#${main.id}`)
  })

  it('el botón de menú abre y cierra el panel lateral (Escape devuelve el foco)', async () => {
    const user = userEvent.setup()
    renderShell()
    const menuButton = screen.getByRole('button', { name: 'Abrir menú de navegación' })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')

    await user.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(menuButton.getAttribute('aria-controls'))).toBeInTheDocument()
    // El foco entra en el panel (en el siguiente fotograma): primer control, el botón de cierre.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cerrar menú de navegación' })).toHaveFocus())

    await user.keyboard('{Escape}')
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(menuButton).toHaveFocus()
  })

  it('con el menú móvil abierto, el contenido de detrás no es alcanzable (inert)', async () => {
    const user = userEvent.setup()
    renderShell()
    const content = screen.getByRole('main').parentElement
    expect(content).not.toHaveAttribute('inert')

    await user.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }))
    expect(content).toHaveAttribute('inert')
    await user.keyboard('{Escape}')
    expect(content).not.toHaveAttribute('inert')
  })

  it('al pasar a tamaño escritorio se cierra el menú móvil', async () => {
    const listeners = new Set()
    const original = window.matchMedia
    window.matchMedia = () => ({
      matches: false,
      addEventListener: (_type, fn) => listeners.add(fn),
      removeEventListener: (_type, fn) => listeners.delete(fn),
    })
    try {
      const user = userEvent.setup()
      renderShell()
      const menuButton = screen.getByRole('button', { name: 'Abrir menú de navegación' })
      await user.click(menuButton)
      expect(listeners.size).toBe(1)

      act(() => listeners.forEach((fn) => fn({ matches: true })))
      expect(menuButton).toHaveAttribute('aria-expanded', 'false')
      expect(listeners.size).toBe(0) // limpieza del listener
    } finally {
      window.matchMedia = original
    }
  })

  it('navegar por el menú lo cierra', async () => {
    const user = userEvent.setup()
    renderShell()
    const menuButton = screen.getByRole('button', { name: 'Abrir menú de navegación' })
    await user.click(menuButton)
    await user.click(screen.getByRole('button', { name: 'Cerrar menú de navegación' }))
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('Sidebar', () => {
  it('marca el enlace activo con aria-current', () => {
    render(<Sidebar brand={brand} items={items} activePath="/vitals" />)
    const nav = screen.getByRole('navigation')
    expect(within(nav).getByRole('link', { name: 'Signos vitales' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Panel principal' })).not.toHaveAttribute('aria-current')
    expect(screen.getByText('Astronaut Wellness System')).toBeInTheDocument()
  })

  it('usa el componente de enlace del router cuando se proporciona', () => {
    const FakeLink = ({ to, end, ...props }) => <a href={to} data-to={to} data-end={String(end)} {...props} />
    render(<Sidebar brand={brand} items={[{ to: '/', label: 'Inicio', end: true }]} linkComponent={FakeLink} />)
    expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('data-to', '/')
  })
})

describe('MetricCard', () => {
  it('muestra valor y unidad', () => {
    render(<MetricCard label="Frecuencia cardiaca" value={72} unit="bpm" icon={Activity} hint="Última lectura" />)
    expect(screen.getByText('72')).toBeInTheDocument()
    expect(screen.getByText('bpm')).toBeInTheDocument()
    expect(screen.getByText('Última lectura')).toBeInTheDocument()
  })

  it.each([null, undefined, ''])('sin valor (%j) anuncia "Sin datos" y no inventa cifras', (value) => {
    render(<MetricCard label="SpO₂" value={value} unit="%" />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.queryByText('%')).not.toBeInTheDocument()
  })

  it('muestra 0 como un valor real', () => {
    render(<MetricCard label="Alertas activas" value={0} />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('Sin datos')).not.toBeInTheDocument()
  })
})

describe('StatusIndicator', () => {
  it('comunica el estado con texto, no solo con color', () => {
    render(<StatusIndicator tone="success" label="Socket.IO conectado" />)
    const indicator = screen.getByText('Socket.IO conectado').closest('[data-slot="status-indicator"]')
    expect(indicator).toHaveAttribute('data-tone', 'success')
  })

  it('puede ocultar visualmente el texto manteniéndolo para lectores de pantalla', () => {
    render(<StatusIndicator tone="warning" label="Enlace degradado" hideLabel />)
    expect(screen.getByText('Enlace degradado')).toHaveClass('sr-only')
  })
})

describe('LoadingState, EmptyState y ErrorState', () => {
  it('LoadingState se anuncia como estado', () => {
    render(<LoadingState label="Cargando tripulación…" rows={2} />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando tripulación…')
  })

  it('EmptyState explica la ausencia de datos y admite una acción', () => {
    render(<EmptyState title="Sin alertas" description="Ground API no ha recibido alertas." action={<button>Actualizar</button>} />)
    expect(screen.getByText('Sin alertas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actualizar' })).toBeInTheDocument()
  })

  it('ErrorState se anuncia como alerta y permite reintentar', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ErrorState message="HTTP 503" onRetry={onRetry} />)

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los datos')
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('ErrorState desactiva el botón mientras reintenta', () => {
    render(<ErrorState onRetry={() => {}} retrying />)
    expect(screen.getByRole('button', { name: 'Reintentando…' })).toBeDisabled()
  })
})
