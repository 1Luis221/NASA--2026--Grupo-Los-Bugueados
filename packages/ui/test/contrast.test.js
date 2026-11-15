// @vitest-environment node
// La medición es una herramienta de Node (lee globals.css del disco), no un componente.
import { describe, expect, it } from 'vitest'
import { composite, contrastRatio, evaluate, oklchToLinearRgb, parseTokens } from '../scripts/contrast.mjs'

describe('medición de contraste (WCAG 2.2)', () => {
  it('el conversor reproduce valores de referencia', () => {
    const white = oklchToLinearRgb({ L: 1, C: 0, h: 0 })
    const black = oklchToLinearRgb({ L: 0, C: 0, h: 0 })
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5)
    // oklch(0.6279 0.2577 29.23) es el rojo sRGB puro (#ff0000)
    oklchToLinearRgb({ L: 0.6279, C: 0.2577, h: 29.23 }).forEach((c, i) => expect(c).toBeCloseTo([1, 0, 0][i], 2))
  })

  it('la transparencia se mezcla con el fondo (un 0 % de alfa no tiene contraste)', () => {
    const bg = { L: 0.2, C: 0, h: 0, alpha: 1 }
    expect(contrastRatio(composite({ L: 1, C: 0, h: 0, alpha: 0 }, bg), composite(bg, bg))).toBeCloseTo(1, 5)
  })

  it('lee los tokens reales de globals.css', () => {
    const tokens = parseTokens()
    expect(Object.keys(tokens)).toEqual(expect.arrayContaining(['background', 'foreground', 'card', 'input', 'ring', 'chart-5']))
  })

  it('todas las combinaciones usadas cumplen AA: texto 4.5:1; controles, foco e indicadores 3:1', () => {
    const failures = evaluate().filter((r) => !r.pass)
    expect(failures).toEqual([])
  })
})
