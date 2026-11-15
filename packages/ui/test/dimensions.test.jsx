import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { exampleAlert, exampleCameraMetrics, exampleVigilanceTest, exampleVitalSigns, exampleWellnessCheckIn } from '@astronaut-wellness/shared/examples'
import { AlertList, DimensionPanel, FATIGUE_INDICATORS, STRESS_INDICATORS, buildFatigueIndicators, buildStressIndicators } from '../src/index.js'

const at = (iso, record, extra = {}) => ({ ...structuredClone(record), id: crypto.randomUUID(), recordedAt: iso, ...extra })

describe('Dimensiones de fatiga y respuesta al estrés', () => {
  it('cada indicador sale de su fuente, en orden cronológico, y omite los registros sin ese dato', () => {
    const checkIns = [
      at('2026-11-14T09:00:00.000Z', exampleWellnessCheckIn, { sleepiness: 7, sleepDuration: { value: 5.5, unit: 'h' } }),
      at('2026-11-14T07:00:00.000Z', exampleWellnessCheckIn, { sleepiness: 3 }),
      at('2026-11-14T08:00:00.000Z', exampleWellnessCheckIn, { sleepiness: undefined }),
    ]
    const fatigue = Object.fromEntries(buildFatigueIndicators({ checkIns }).map((i) => [i.key, i]))
    expect(fatigue.sleepiness.points.map((p) => p.value)).toEqual([3, 7])
    expect(fatigue.sleepiness.latest).toMatchObject({ value: 7, t: '2026-11-14T09:00:00.000Z', source: exampleWellnessCheckIn.source })
    expect(fatigue.fatigue.count).toBe(3)
    expect(fatigue.pvtMeanRt.latest).toBeNull() // sin pruebas: sin dato, nunca 0
    expect(fatigue.eyeClosure).toMatchObject({ experimental: true, latest: null })
  })

  it('no construye ninguna puntuación combinada: solo indicadores separados', () => {
    const keys = [...FATIGUE_INDICATORS, ...STRESS_INDICATORS].map((i) => i.key)
    expect(keys).not.toEqual(expect.arrayContaining([expect.stringMatching(/score|index|puntuaci/i)]))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('HRV solo sale del campo de HRV del sensor (nunca de la frecuencia cardiaca)', () => {
    const onlyHr = at('2026-11-14T10:00:00.000Z', exampleVitalSigns, { heartRateVariability: undefined })
    const stress = Object.fromEntries(buildStressIndicators({ vitals: [onlyHr] }).map((i) => [i.key, i]))
    expect(stress.heartRate.latest.value).toBe(onlyHr.heartRate.value)
    expect(stress.hrv.latest).toBeNull()
    expect(stress.hrv.note).toMatch(/RMSSD.*No se deriva del pulso/)
  })

  it('el panel muestra último valor, fecha, procedencia, tendencia y cómo obtener lo que falta', () => {
    const vitals = [
      at('2026-11-14T10:00:00.000Z', exampleVitalSigns, { heartRate: { value: 70, unit: 'bpm' }, activityLevel: { value: 1.2, unit: 'MET' } }),
      at('2026-11-14T10:05:00.000Z', exampleVitalSigns, { heartRate: { value: 84, unit: 'bpm' }, activityLevel: { value: 3.4, unit: 'MET' } }),
    ]
    render(<DimensionPanel indicators={buildStressIndicators({ vitals, checkIns: [] })} label="Estrés" />)
    const list = screen.getByRole('list', { name: 'Estrés' })
    const hr = within(list).getByRole('article', { name: 'Frecuencia cardiaca' })
    expect(within(hr).getByText('84 lpm')).toBeInTheDocument()
    expect(within(hr).getByText('2026-11-14 10:05 UTC')).toBeInTheDocument()
    expect(within(hr).getByText('Simulado')).toBeInTheDocument()
    expect(within(hr).getByText(/2 registros · primero 70 lpm, último 84 lpm · rango 70–84/)).toBeInTheDocument()
    expect(hr.querySelector('[data-slot="sparkline"]')).not.toBeNull()

    const stress = within(list).getByRole('article', { name: 'Estrés percibido' })
    expect(within(stress).getByText('Sin datos.')).toBeInTheDocument()
    expect(within(stress).getByText(/autoevaluación a bordo/)).toBeInTheDocument()
    expect(screen.getByText(/3 de 4 indicadores con datos/)).toBeInTheDocument()
  })

  it('las métricas de cámara se marcan como experimentales; los autodeclarados se muestran sobre su escala', () => {
    const cameraMetrics = [at('2026-11-14T10:00:00.000Z', exampleCameraMetrics)]
    const vigilanceTests = [at('2026-11-14T10:00:00.000Z', exampleVigilanceTest)]
    const checkIns = [at('2026-11-14T10:00:00.000Z', exampleWellnessCheckIn, { sleepiness: 6 })]
    render(<DimensionPanel indicators={buildFatigueIndicators({ cameraMetrics, vigilanceTests, checkIns })} label="Fatiga" />)
    expect(within(screen.getByRole('article', { name: 'Ojos cerrados (cámara)' })).getByText('Experimental')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Somnolencia autodeclarada' })).getByText('6/9')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'PVT · tiempo de reacción medio' })).getByText(/PVT-B · 1 lapsos · 3 errores/)).toBeInTheDocument()
  })
})

describe('AlertList · regla y evidencia', () => {
  it('identifica la regla demostrativa y lista la evidencia con su procedencia', () => {
    const alert = {
      ...structuredClone(exampleAlert),
      category: 'cognitive',
      rule: { id: 'demo.pvt.lapses', name: 'Lapsos', demonstrative: true, parameters: { minLapses: 5 } },
      evidence: [{ entityType: 'vigilance_test', id: crypto.randomUUID(), recordedAt: '2026-11-14T07:00:00.000Z', source: { type: 'cognitive_test', simulated: false }, summary: 'PVT-B: 6 lapsos' }],
    }
    render(<AlertList alerts={[alert]} />)
    expect(screen.getByText('Regla demostrativa')).toBeInTheDocument()
    expect(screen.getByText(/minLapses=5/)).toBeInTheDocument()
    expect(screen.getByText('Rendimiento cognitivo')).toBeInTheDocument()
    expect(screen.getByText('Evidencia (1)')).toBeInTheDocument()
    expect(screen.getByText(/Prueba cognitiva · real — PVT-B: 6 lapsos/)).toBeInTheDocument()
  })
})
