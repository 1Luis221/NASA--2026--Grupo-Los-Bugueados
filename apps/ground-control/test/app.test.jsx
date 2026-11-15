import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NAV_ITEMS } from '../src/navigation.js'
import { renderApp } from './render-app.jsx'

describe('Ground Control · estructura', () => {
  it('renderiza el nombre del producto, el menú y la vista inicial', async () => {
    renderApp()
    expect(screen.getByText('Astronaut Wellness System')).toBeInTheDocument()
    expect(screen.getByText('Ground Control')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getAllByRole('link').map((link) => link.textContent)).toEqual(NAV_ITEMS.map((i) => i.label))
    expect(screen.getByRole('heading', { level: 1, name: 'Panel principal' })).toBeInTheDocument()
    expect(await screen.findByText('Tripulantes conocidos')).toBeInTheDocument()
  })

  it('navega entre las cinco pantallas con el menú y marca la activa', async () => {
    const { user } = renderApp()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })

    const screens = [
      ['Tripulación', () => screen.findByRole('list', { name: 'Tripulación' })],
      ['Alertas', () => screen.findByRole('search', { name: 'Filtrar alertas' })],
      ['Sincronización', () => screen.findByRole('heading', { name: 'A · Datos recibidos' })],
      ['Panel principal', () => screen.findByText('Tripulantes conocidos')],
    ]
    for (const [label, findContent] of screens) {
      await user.click(within(nav).getByRole('link', { name: label }))
      // React Router navega en una transición: la vista anterior se mantiene hasta que carga la nueva.
      // Margen amplio: cada vista se carga bajo demanda y con el equipo cargado puede tardar más de 1 s.
      expect(await screen.findByRole('heading', { level: 1, name: label }, { timeout: 5000 })).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
      expect(await findContent()).toBeInTheDocument()
    }
  }, 15_000) // visita varias vistas cargadas bajo demanda: con el equipo cargado puede superar 5 s

  it('muestra un estado de página no encontrada', () => {
    renderApp({ path: '/no-existe' })
    expect(screen.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
  })

  it('el encabezado indica la conexión en tiempo real, no el enlace espacial', () => {
    renderApp()
    expect(screen.getByText('Tiempo real: conectando…')).toBeInTheDocument()
  })
})
