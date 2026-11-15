import { act, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SOCKET_EVENTS } from '@astronaut-wellness/shared'
import { ApiError } from '@astronaut-wellness/ui'
import { vital } from './helpers.js'
import { ANA_ID, UNKNOWN_ID, createFakeGroundApi, emptyFixtures, fixtures, renderApp } from './render-app.jsx'

const metric = (label) => screen.getByText(label).closest('[data-slot="metric-card"]')

describe('Panel principal', () => {
  it('con datos: indicadores, tripulantes desconocidos, constantes y bienestar', async () => {
    renderApp()
    await waitFor(() => expect(within(metric('Eventos recibidos')).getByText('42')).toBeInTheDocument())

    expect(within(metric('Tripulantes conocidos')).getByText('1')).toBeInTheDocument()
    expect(within(metric('Tripulantes desconocidos')).getByText('1')).toBeInTheDocument()
    expect(within(metric('Tripulantes desconocidos')).getByText('Solo identificador: c4a8e2f1')).toBeInTheDocument()
    expect(within(metric('Alertas activas')).getByText('1')).toBeInTheDocument()
    expect(within(metric('Último dato recibido')).getByText('2026-11-14 10:00:06 UTC')).toBeInTheDocument()

    const vitals = screen.getByRole('table', { name: 'Última lectura por tripulante (hora en UTC)' })
    const rows = within(vitals).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByRole('link', { name: 'Ana Torres (Nova)' })).toHaveAttribute('href', `/crew/${ANA_ID}`)
    expect(within(rows[0]).getByText('76 lpm')).toBeInTheDocument()
    expect(within(rows[1]).getByRole('link', { name: 'Tripulante desconocido · c4a8e2f1' })).toBeInTheDocument()
    expect(within(vitals).getAllByText('Simulado')).toHaveLength(2)

    expect(screen.getByText(/Medias descriptivas de 3 autoevaluaciones/)).toBeInTheDocument()
    expect(screen.getByText(/no indica por sí sola el estado del enlace/)).toBeInTheDocument()
  })

  it('sin datos: estado vacío y contadores reales a cero (sin inventar)', async () => {
    renderApp({ data: emptyFixtures() })
    expect(await screen.findByText('Ground API todavía no ha recibido datos')).toBeInTheDocument()
    expect(within(metric('Tripulantes conocidos')).getByText('0')).toBeInTheDocument()
    expect(within(metric('Último dato recibido')).getByText('Sin datos')).toBeInTheDocument()
  })

  it('error HTTP: muestra el mensaje de la API y permite reintentar', async () => {
    const api = createFakeGroundApi(fixtures())
    const working = api.listCrew.getMockImplementation()
    api.listCrew.mockImplementation(async () => {
      throw new ApiError({ status: 503, code: 'HTTP_503', message: 'La API respondió con HTTP 503' })
    })
    const { user } = renderApp({ api })

    expect(await screen.findByText('La API respondió con HTTP 503')).toBeInTheDocument()
    api.listCrew.mockImplementation(working)
    await user.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.queryByText('La API respondió con HTTP 503')).not.toBeInTheDocument())
    expect(within(metric('Tripulantes conocidos')).getByText('1')).toBeInTheDocument()
  })
})

describe('Tripulación', () => {
  it('lista los tripulantes con nombre, identificador, rol, estado, última medición y alertas', async () => {
    renderApp({ path: '/crew' })
    const list = await screen.findByRole('list', { name: 'Tripulación' })
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2))

    const [ana, unknown] = within(list).getAllByRole('listitem')
    expect(within(ana).getByRole('heading', { name: 'Ana Torres (Nova)' })).toBeInTheDocument()
    expect(within(ana).getByText(ANA_ID)).toBeInTheDocument()
    expect(within(ana).getByText('Comandante')).toBeInTheDocument()
    expect(within(ana).getByText('Activo')).toBeInTheDocument()
    expect(within(ana).getByText('FC 76 lpm')).toBeInTheDocument()
    expect(within(unknown).getByText(UNKNOWN_ID)).toBeInTheDocument()
  })

  it('tripulantes desconocidos: solo su identificador real y un aviso explicativo', async () => {
    renderApp({ path: '/crew' })
    const card = (await screen.findByRole('heading', { name: 'Tripulante desconocido · c4a8e2f1' })).closest('[data-slot="crew-card"]')
    expect(within(card).getByText('Perfil no recibido por Ground API')).toBeInTheDocument()
    expect(within(card).queryByText('Comandante')).not.toBeInTheDocument()
    expect(screen.getByText('1 tripulante sin perfil')).toBeInTheDocument()
  })

  it('navega al detalle al seleccionar un tripulante', async () => {
    const { user } = renderApp({ path: '/crew' })
    await user.click(await screen.findByRole('link', { name: 'Ver detalle de Ana Torres (Nova)' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Detalle del tripulante' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'Ana Torres (Nova)' })).toBeInTheDocument()
  })

  it('sin datos: estado vacío', async () => {
    renderApp({ path: '/crew', data: emptyFixtures() })
    expect(await screen.findByText('Sin tripulantes')).toBeInTheDocument()
  })
})

describe('Detalle del tripulante', () => {
  it('signos vitales con unidades, origen simulado e historial con resumen textual', async () => {
    const { user } = renderApp({ path: `/crew/${ANA_ID}` })
    const last = await screen.findByRole('region', { name: 'Última medición' })
    await waitFor(() => expect(within(last).getByText('76 lpm')).toBeInTheDocument())
    expect(within(last).getByText('97%')).toBeInTheDocument()
    expect(within(last).getByText('Simulado')).toBeInTheDocument()

    const history = screen.getByRole('region', { name: 'Historial de signos vitales' })
    expect(within(history).getByText('Frecuencia cardiaca: 2 lecturas entre 10:00:00 y 10:00:05 UTC; rango 70–76 lpm; última 76 lpm.')).toBeInTheDocument()
    expect(within(history).getByRole('table', { name: 'Últimas 2 lecturas de frecuencia cardiaca' })).toBeInTheDocument()

    await user.click(within(history).getByRole('button', { name: /SpO₂/ }))
    expect(within(history).getByText(/^Saturación de oxígeno: 2 lecturas/)).toBeInTheDocument()
  })

  it('autoevaluaciones, alertas relacionadas y cámara vacía', async () => {
    renderApp({ path: `/crew/${ANA_ID}` })
    const checkIns = await screen.findByRole('region', { name: 'Autoevaluaciones' })
    await waitFor(() => expect(within(checkIns).getAllByRole('row')).toHaveLength(4))
    expect(within(checkIns).getByText('Dolor de cabeza leve')).toBeInTheDocument()
    expect(within(checkIns).getAllByText('Dato real')).toHaveLength(3)

    const alerts = screen.getByRole('region', { name: 'Alertas relacionadas' })
    expect(within(alerts).getByText('Autoevaluación pendiente')).toBeInTheDocument()
    expect(within(alerts).queryByText('Enlace nave–Tierra interrumpido')).not.toBeInTheDocument()

    const camera = screen.getByRole('region', { name: 'Cámara' })
    expect(within(camera).getByText('Sin métricas de cámara')).toBeInTheDocument()
  })

  it('tripulante desconocido: muestra sus mediciones sin perfil inventado', async () => {
    renderApp({ path: `/crew/${UNKNOWN_ID}` })
    expect(await screen.findByRole('heading', { level: 2, name: 'Tripulante desconocido · c4a8e2f1' })).toBeInTheDocument()
    const profile = screen.getByRole('region', { name: 'Perfil' })
    expect(within(profile).getByText('No recibido por Ground API')).toBeInTheDocument()
    expect(within(profile).queryByText('Rol')).not.toBeInTheDocument()
  })

  it('identificador no válido: mensaje comprensible', async () => {
    renderApp({ path: '/crew/no-es-uuid' })
    expect(await screen.findByText('Identificador de tripulante no válido')).toBeInTheDocument()
  })
})

describe('Alertas', () => {
  it('lista título, severidad, estado, tripulante, fechas y filtra por estado y severidad', async () => {
    const { user, api } = renderApp({ path: '/alerts' })
    const table = await screen.findByRole('table', { name: 'Alertas recibidas por Ground API' })
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(3))
    expect(within(table).getByRole('link', { name: 'Ana Torres (Nova)' })).toBeInTheDocument()
    expect(within(table).getByText('General')).toBeInTheDocument()
    expect(within(table).getByText('2026-11-14 06:30 UTC')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reconocer|resolver/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: 'Estado' }))
    await user.click(await screen.findByRole('option', { name: 'Resuelta' }))

    await waitFor(() => expect(screen.getByText('1 alerta')).toBeInTheDocument())
    expect(screen.getByText('Autoevaluación pendiente')).toBeInTheDocument()
    expect(api.listAlerts).toHaveBeenCalledWith(expect.objectContaining({ status: 'resolved' }))
  })

  it('los filtros pueden llegar en la URL y sin coincidencias se explica', async () => {
    renderApp({ path: '/alerts?severity=critical' })
    expect(await screen.findByText('Ninguna alerta coincide con los filtros.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Severidad' })).toHaveTextContent('Crítica')
  })
})

describe('Sincronización', () => {
  it('A · estadísticas reales, eventos recientes y rechazos', async () => {
    renderApp({ path: '/sync' })
    const received = await screen.findByRole('region', { name: 'A · Datos recibidos' })
    await waitFor(() => expect(within(received).getByText('Aceptados')).toBeInTheDocument())
    const card = (label) => within(received).getByText(label).closest('[data-slot="metric-card"]')
    expect(within(card('Aceptados')).getByText('42')).toBeInTheDocument()
    expect(within(card('Duplicados')).getByText('1')).toBeInTheDocument()
    expect(within(card('Última secuencia de la nave')).getByText('44')).toBeInTheDocument()
    expect(await within(received).findByText('#44')).toBeInTheDocument()
    expect(within(received).getByText('payload.heartRate.value: Too big')).toBeInTheDocument()
  })

  it('B y C · la conexión del navegador no se presenta como estado del enlace', async () => {
    const { socket } = renderApp({ path: '/sync' })
    act(() => socket.serverConnect())

    const browser = await screen.findByRole('region', { name: 'B · Conexión de este navegador' })
    expect(within(browser).getByText('Tiempo real: conectado')).toBeInTheDocument()

    const link = screen.getByRole('region', { name: 'C · Enlace nave–Tierra' })
    const indicators = link.querySelectorAll('[data-slot="status-indicator"]')
    expect([...indicators].map((i) => i.textContent)).toEqual(['Estado del enlace no verificable desde Tierra'])
    expect(within(link).queryByText('Tiempo real: conectado')).not.toBeInTheDocument()
    await waitFor(() => expect(within(link).getByText('2026-11-14 10:00:06 UTC')).toBeInTheDocument())
  })
})

describe('Tiempo real', () => {
  it('actualiza indicadores y listas al llegar eventos, sin duplicar', async () => {
    const { socket } = renderApp({ path: `/crew/${ANA_ID}` })
    const history = await screen.findByRole('region', { name: 'Historial de signos vitales' })
    await waitFor(() => expect(within(history).getByText(/^Frecuencia cardiaca: 2 lecturas/)).toBeInTheDocument())

    const live = vital({ crewMemberId: ANA_ID, recordedAt: '2026-11-14T10:00:10.000Z', heartRate: { value: 81, unit: 'bpm' } })
    act(() => {
      socket.serverEmit(SOCKET_EVENTS.VITALS_RECORDED, live)
      socket.serverEmit(SOCKET_EVENTS.VITALS_RECORDED, structuredClone(live)) // duplicado
    })

    expect(within(history).getByText(/^Frecuencia cardiaca: 3 lecturas .*última 81 lpm/)).toBeInTheDocument()
    const last = screen.getByRole('region', { name: 'Última medición' })
    expect(within(last).getByText('81 lpm')).toBeInTheDocument()
  })

  it('alert:updated actualiza el contador de alertas activas', async () => {
    const data = fixtures()
    const { socket } = renderApp({ data })
    await waitFor(() => expect(within(metric('Alertas activas')).getByText('1')).toBeInTheDocument())

    const active = data.alerts[0]
    act(() =>
      socket.serverEmit(SOCKET_EVENTS.ALERT_UPDATED, {
        ...active,
        status: 'resolved',
        resolvedAt: '2026-11-14T10:05:00.000Z',
        updatedAt: '2026-11-14T10:05:00.000Z',
      }),
    )
    expect(within(metric('Alertas activas')).getByText('0')).toBeInTheDocument()
  })

  it('reconexión: avisa de posible desactualización y recupera por HTTP', async () => {
    const data = fixtures()
    const { socket, api } = renderApp({ data })
    act(() => socket.serverConnect())
    await waitFor(() => expect(within(metric('Eventos recibidos')).getByText('42')).toBeInTheDocument())

    act(() => socket.serverDisconnect('transport close'))
    expect(screen.getByText('Sin conexión en tiempo real con Ground API')).toBeInTheDocument()
    expect(screen.getByText(/Los datos mostrados pueden estar desactualizados/)).toBeInTheDocument()

    // Mientras no había conexión llegó otro tripulante a Ground API.
    data.crew = [...data.crew, { ...data.crew[0], id: crypto.randomUUID(), name: 'Kenji Watanabe', callsign: 'Orbit' }]
    const calls = api.listCrew.mock.calls.length
    act(() => socket.serverConnect())

    await waitFor(() => expect(within(metric('Tripulantes conocidos')).getByText('2')).toBeInTheDocument())
    expect(api.listCrew.mock.calls.length).toBeGreaterThan(calls)
    expect(screen.queryByText('Sin conexión en tiempo real con Ground API')).not.toBeInTheDocument()
  })

  it('reinicio de Ground API: descarta los datos antiguos del navegador y lo explica', async () => {
    const data = fixtures()
    const { socket, user } = renderApp({ data })
    act(() => socket.serverConnect())
    await waitFor(() => expect(within(metric('Tripulantes conocidos')).getByText('1')).toBeInTheDocument())

    // Ground API se reinicia: pierde todo lo que tenía en memoria.
    Object.assign(data, emptyFixtures(), { stats: { ...emptyFixtures().stats, accepted: 2, processedEvents: 2 } })
    act(() => socket.serverDisconnect('transport close'))
    act(() => socket.serverConnect())

    expect(await screen.findByText('Ground API se ha reiniciado')).toBeInTheDocument()
    expect(screen.getByText(/42 → 2/)).toBeInTheDocument()
    await waitFor(() => expect(within(metric('Tripulantes conocidos')).getByText('0')).toBeInTheDocument())
    expect(screen.queryByText('76 lpm')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByText('Ground API se ha reiniciado')).not.toBeInTheDocument()
  })

  it('una sola conexión Socket.IO para toda la app aunque se cambie de pantalla', async () => {
    const { user, socket } = renderApp()
    await user.click(screen.getByRole('link', { name: 'Alertas' }))
    await screen.findByRole('heading', { level: 1, name: 'Alertas' })
    await user.click(screen.getByRole('link', { name: 'Sincronización' }))
    await screen.findByRole('heading', { level: 1, name: 'Sincronización' })
    expect(socket.connect).toHaveBeenCalledTimes(1)
    expect(socket.disconnect).not.toHaveBeenCalled()
  })
})

describe('Accesibilidad básica y diseño adaptable', () => {
  it('navegación por teclado: saltar al contenido, menú y regiones con encabezados', async () => {
    const { user } = renderApp()
    await screen.findByText('Tripulantes conocidos')

    await user.tab()
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveFocus()

    // Sin CSS en jsdom, el botón de cerrar el menú móvil (oculto en escritorio) también es tabulable.
    const target = screen.getByRole('link', { name: 'Tripulación' })
    for (let i = 0; i < 5 && document.activeElement !== target; i++) await user.tab()
    expect(target).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { level: 1, name: 'Tripulación' })).toBeInTheDocument()

    await screen.findByRole('list', { name: 'Tripulación' })
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('las secciones del panel son regiones con nombre y las tablas tienen título', async () => {
    renderApp()
    await screen.findByRole('region', { name: 'Últimas constantes vitales' })
    for (const table of screen.getAllByRole('table')) expect(table).toHaveAccessibleName()
  })

  it('las tablas se desplazan horizontalmente en pantallas estrechas y las rejillas se adaptan', async () => {
    renderApp()
    const table = await screen.findByRole('table', { name: 'Última lectura por tripulante (hora en UTC)' })
    expect(table.closest('[data-slot="table-container"]')).toHaveClass('overflow-x-auto')
    expect(metric('Alertas activas').parentElement).toHaveClass('grid-cols-1', 'sm:grid-cols-2', 'xl:grid-cols-5')
  })
})
