import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { exampleAlert, exampleCameraMetrics, exampleVigilanceTest, exampleVitalSigns, exampleWellnessCheckIn } from '@astronaut-wellness/shared/examples'
import {
  AlertList,
  CameraMetricsTable,
  CheckInTable,
  CrewCard,
  SourceBadge,
  VigilanceTestTable,
  VitalSignsChart,
  VitalSignsSummary,
  WellnessSummary,
  latestByCrew,
  resolveCrewMember,
  summarizeCheckIns,
  summarizeVitalSign,
} from '../src/index.js'

const reading = (overrides = {}) => ({ ...structuredClone(exampleVitalSigns), id: crypto.randomUUID(), ...overrides })
const checkIn = (overrides = {}) => ({ ...structuredClone(exampleWellnessCheckIn), id: crypto.randomUUID(), ...overrides })

describe('SourceBadge', () => {
  it('marca visiblemente los datos simulados', () => {
    render(<SourceBadge source={{ type: 'sensor', simulated: true, deviceId: 'sim-01' }} />)
    expect(screen.getByText('Simulado')).toHaveAttribute('title', 'Sensor · simulado (sim-01)')
  })

  it('distingue los datos reales', () => {
    render(<SourceBadge source={{ type: 'self_report', simulated: false }} />)
    expect(screen.getByText('Dato real')).toBeInTheDocument()
  })
})

describe('VitalSignsChart', () => {
  const readings = [
    reading({ recordedAt: '2026-11-14T10:00:00.000Z', heartRate: { value: 70, unit: 'bpm' } }),
    reading({ recordedAt: '2026-11-14T10:00:05.000Z', heartRate: { value: 76, unit: 'bpm' } }),
  ]

  it('acompaña el gráfico con un resumen textual y una tabla accesible', () => {
    render(<VitalSignsChart readings={readings} />)
    const summary = 'Frecuencia cardiaca: 2 lecturas entre 10:00:00 y 10:00:05 UTC; rango 70–76 lpm; última 76 lpm.'
    expect(screen.getByText(summary)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: `Gráfico. ${summary}` })).toBeInTheDocument()

    const table = screen.getByRole('table', { name: 'Últimas 2 lecturas de frecuencia cardiaca' })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[1].textContent)).toEqual(['76 lpm', '70 lpm'])
    expect(within(table).getAllByText('Simulado')).toHaveLength(2)
  })

  it('cambia de medición con botones accesibles (aria-pressed)', async () => {
    const user = userEvent.setup()
    render(<VitalSignsChart readings={readings} />)
    const spo2 = screen.getByRole('button', { name: /SpO₂/ })
    expect(spo2).toHaveAttribute('aria-pressed', 'false')

    await user.click(spo2)
    expect(spo2).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText(/^Saturación de oxígeno: 2 lecturas/)).toBeInTheDocument()
  })

  it('presión arterial: resumen con sistólica y diastólica', () => {
    expect(summarizeVitalSign(readings, 'bloodPressure')).toContain('sistólica 118–118 mmHg, diastólica 76–76 mmHg')
  })

  it('sin lecturas de esa medición muestra un estado vacío', () => {
    render(<VitalSignsChart readings={[reading({ heartRate: undefined })]} />)
    expect(screen.getByText('Sin lecturas de frecuencia cardiaca')).toBeInTheDocument()
  })
})

describe('VitalSignsSummary', () => {
  it('muestra cada valor con su unidad, hora y origen', () => {
    render(<VitalSignsSummary reading={exampleVitalSigns} />)
    expect(screen.getByText('72 lpm')).toBeInTheDocument()
    expect(screen.getByText('98%')).toBeInTheDocument()
    expect(screen.getByText('36,7 °C')).toBeInTheDocument()
    expect(screen.getByText('118/76 mmHg')).toBeInTheDocument()
    expect(screen.getByText('2026-11-14 10:00:00 UTC')).toBeInTheDocument()
    expect(screen.getByText('Simulado')).toBeInTheDocument()
  })

  it('sin lectura muestra el estado vacío', () => {
    render(<VitalSignsSummary reading={undefined} emptyTitle="Sin mediciones" />)
    expect(screen.getByText('Sin mediciones')).toBeInTheDocument()
  })
})

describe('AlertList', () => {
  it('muestra título, severidad, estado, tripulante y fechas con texto', () => {
    const resolved = { ...exampleAlert, id: crypto.randomUUID(), status: 'resolved', resolvedAt: '2026-11-14T08:00:00.000Z' }
    const general = { ...exampleAlert, id: crypto.randomUUID(), crewMemberId: undefined, severity: 'critical', status: 'active' }
    render(<AlertList alerts={[resolved, general]} renderCrew={(id) => `crew:${id.slice(0, 4)}`} caption="Alertas" />)

    const rows = within(screen.getByRole('table', { name: 'Alertas' })).getAllByRole('row').slice(1)
    expect(within(rows[0]).getByText('Fatiga autoinformada elevada')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Aviso')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Resuelta')).toBeInTheDocument()
    expect(within(rows[0]).getByText('crew:1232')).toBeInTheDocument()
    expect(within(rows[0]).getByText('2026-11-14 08:00 UTC')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Crítica')).toBeInTheDocument()
    expect(within(rows[1]).getByText('General')).toBeInTheDocument()
  })

  it('sin alertas muestra un estado vacío', () => {
    render(<AlertList alerts={[]} emptyTitle="Sin alertas" />)
    expect(screen.getByText('Sin alertas')).toBeInTheDocument()
  })
})

describe('CrewCard', () => {
  const profile = { id: '7d1f3c2a-5b8e-4f6a-9c0d-1e2f3a4b5c6d', name: 'Ana Torres', callsign: 'Nova', role: 'commander', status: 'active', agency: 'ESA' }

  it('tripulante conocido: nombre, rol, estado, última medición y enlace', () => {
    const member = resolveCrewMember(profile.id, new Map([[profile.id, profile]]))
    render(<CrewCard member={member} latestReading={exampleVitalSigns} activeAlertCount={2} to={`/crew/${profile.id}`} />)
    expect(screen.getByRole('heading', { name: 'Ana Torres (Nova)' })).toBeInTheDocument()
    expect(screen.getByText('Comandante')).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('FC 72 lpm')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver detalle de Ana Torres (Nova)' })).toHaveAttribute('href', `/crew/${profile.id}`)
  })

  it('tripulante desconocido: solo identificador real, sin rol ni estado inventados', () => {
    const id = 'c4a8e2f1-3d5b-4c7e-8f9a-0b1c2d3e4f5a'
    render(<CrewCard member={resolveCrewMember(id, new Map())} />)
    expect(screen.getByRole('heading', { name: 'Tripulante desconocido · c4a8e2f1' })).toBeInTheDocument()
    expect(screen.getByText(id)).toBeInTheDocument()
    expect(screen.getByText('Perfil no recibido por Ground API')).toBeInTheDocument()
    expect(screen.queryByText('Activo')).not.toBeInTheDocument()
    expect(screen.getByText('Sin mediciones recibidas.')).toBeInTheDocument()
  })
})

describe('WellnessSummary y CheckInTable', () => {
  it('no calcula medias con menos registros que el mínimo', () => {
    render(<WellnessSummary checkIns={[checkIn(), checkIn()]} />)
    expect(screen.getByText(/Se necesitan al menos 3 autoevaluaciones .*\(hay 2\)/)).toBeInTheDocument()
  })

  it('muestra medias descriptivas, número de registros y significado de la escala', () => {
    const items = [checkIn({ mood: 2 }), checkIn({ mood: 4 }), checkIn({ mood: 3, sleepDuration: undefined })]
    expect(summarizeCheckIns(items).averages.mood).toBe(3)
    render(<WellnessSummary checkIns={items} />)
    expect(screen.getByText(/Medias descriptivas de 3 autoevaluaciones/)).toBeInTheDocument()
    expect(screen.getByText('1 = muy malo · 5 = muy bueno')).toBeInTheDocument()
    expect(screen.getByText('Media de 2 registros que lo indican')).toBeInTheDocument()
  })

  it('CheckInTable lista las escalas con su significado accesible', () => {
    render(<CheckInTable checkIns={[checkIn()]} />)
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: /Estrés \(1 = muy bajo, 5 = muy alto\)/ })).toBeInTheDocument()
    expect(within(table).getByText('6,5 h')).toBeInTheDocument()
    expect(within(table).getByText('Simulado')).toBeInTheDocument()
  })

  it('CheckInTable vacía muestra estado vacío', () => {
    render(<CheckInTable checkIns={[]} />)
    expect(screen.getByText('Sin autoevaluaciones')).toBeInTheDocument()
  })
})

describe('latestByCrew', () => {
  it('devuelve la lectura más reciente de cada tripulante', () => {
    const a1 = reading({ crewMemberId: 'a', recordedAt: '2026-11-14T10:00:00.000Z' })
    const a2 = reading({ crewMemberId: 'a', recordedAt: '2026-11-14T11:00:00.000Z' })
    const b1 = reading({ crewMemberId: 'b' })
    const latest = latestByCrew([a1, b1, a2])
    expect(latest.get('a')).toBe(a2)
    expect(latest.get('b')).toBe(b1)
  })
})

describe('CameraMetricsTable y VigilanceTestTable', () => {
  it('CameraMetricsTable muestra métricas agregadas, modelo y procedencia (sin imágenes)', () => {
    render(<CameraMetricsTable metrics={[structuredClone(exampleCameraMetrics)]} />)
    const table = screen.getByRole('table', { name: /Métricas agregadas de cámara \(sin imágenes\)/ })
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).getByText('Detectado')).toBeInTheDocument()
    expect(table.querySelector('img, video, canvas')).toBeNull()
  })

  it('CameraMetricsTable vacía muestra un estado vacío', () => {
    render(<CameraMetricsTable metrics={[]} />)
    expect(screen.getByText('Sin métricas de cámara')).toBeInTheDocument()
  })

  it('VigilanceTestTable resume la prueba con el protocolo y su umbral de lapso', () => {
    render(<VigilanceTestTable tests={[structuredClone(exampleVigilanceTest)]} />)
    const table = screen.getByRole('table', { name: /vigilancia psicomotora/ })
    const cells = within(table).getAllByRole('cell').map((c) => c.textContent)
    expect(cells).toEqual(expect.arrayContaining(['6', '346 ms', '280 ms', '1', '2']))
    expect(within(table).getByText('lapso ≥ 355 ms')).toBeInTheDocument()
    expect(within(table).getByText('Dato real')).toBeInTheDocument()
  })

  it('VigilanceTestTable vacía muestra un estado vacío', () => {
    render(<VigilanceTestTable tests={[]} />)
    expect(screen.getByText('Sin pruebas de vigilancia')).toBeInTheDocument()
  })
})
