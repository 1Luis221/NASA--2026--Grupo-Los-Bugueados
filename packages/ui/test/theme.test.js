// @vitest-environment node
// jsdom no evalúa CSS: estas reglas del tema se comprueban sobre el archivo fuente.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/styles/globals.css', import.meta.url)), 'utf8')
const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\)\s*{([\s\S]*?)}\s*}/)?.[1] ?? ''

describe('tema: movimiento reducido', () => {
  it('existe una regla para prefers-reduced-motion', () => {
    expect(reducedMotion).toContain('animation-duration')
  })

  it('las transiciones van a 0s: una duración mínima crearía transiciones de `visibility` y bloquearía el foco del menú móvil', () => {
    expect(reducedMotion).toMatch(/transition-duration:\s*0s\s*!important/)
    expect(reducedMotion).not.toMatch(/transition-duration:\s*0\.0\d*ms/)
  })
})

describe('tema: foco visible', () => {
  it('todo elemento enfocado con teclado tiene contorno', () => {
    expect(css).toMatch(/:focus-visible\s*{\s*@apply outline-2 outline-offset-2 outline-ring;/)
  })

  it('el encabezado fijo no tapa el foco (scroll-padding-top)', () => {
    expect(css).toMatch(/scroll-padding-top:\s*\d/)
  })
})
