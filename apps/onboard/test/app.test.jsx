import { screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderApp } from './render-app.jsx'

const navLabels = () =>
  within(screen.getByRole('navigation', { name: 'Navegación principal' }))
    .getAllByRole('link')
    .map((link) => link.textContent)

afterEach(() => vi.unstubAllEnvs())

describe('Onboard · estructura', () => {
  it('renderiza el nombre del producto, el menú y la vista inicial', async () => {
    renderApp()
    expect(screen.getByText('Astronaut Wellness System')).toBeInTheDocument()
    expect(screen.getByText('Onboard')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Inicio' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Tripulante seleccionado' })).toBeInTheDocument()
  })

  it('navega entre las siete vistas con el menú', async () => {
    const { user } = renderApp()
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    for (const label of ['Signos vitales', 'Autoevaluación', 'Sincronización', 'Cámara', 'Vigilancia', 'Simulación', 'Inicio']) {
      await user.click(within(nav).getByRole('link', { name: label }))
      expect(await screen.findByRole('heading', { level: 1, name: label }, { timeout: 5000 })).toBeInTheDocument()
      expect(within(nav).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
    }
  }, 15_000) // visita varias vistas cargadas bajo demanda: con el equipo cargado puede superar 5 s

  it('en desarrollo el menú incluye Simulación', () => {
    renderApp({ devTools: true })
    expect(navLabels()).toEqual(['Inicio', 'Signos vitales', 'Autoevaluación', 'Sincronización', 'Cámara', 'Vigilancia', 'Simulación'])
  })

  it('en producción no existe Simulación ni en el menú ni como ruta, y no se llama a /api/dev', async () => {
    vi.stubEnv('DEV', false)
    const { api } = renderApp({ path: '/simulation', devTools: false })
    expect(navLabels()).not.toContain('Simulación')
    expect(await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
    for (const fn of Object.values(api.dev)) expect(fn).not.toHaveBeenCalled()
  })

  it('accesibilidad básica: landmarks, enlace para saltar al contenido y selector etiquetado', () => {
    renderApp()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tripulante' })).toBeInTheDocument()
  })
})
