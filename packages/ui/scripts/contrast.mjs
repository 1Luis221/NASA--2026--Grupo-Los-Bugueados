#!/usr/bin/env node
/**
 * Medición reproducible del contraste (WCAG 2.2) de los tokens del tema oscuro
 * definidos en src/styles/globals.css. Sin dependencias.
 *
 *   node packages/ui/scripts/contrast.mjs        → tabla y código de salida 1 si algo falla
 *
 * - Convierte oklch → sRGB lineal (Björn Ottosson) y calcula la luminancia relativa.
 * - Los colores con transparencia se mezclan sobre su fondo en sRGB codificado,
 *   como hacen los navegadores.
 * - Umbrales: texto normal 4.5:1, texto grande 3:1, componentes y foco 3:1 (1.4.11).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CSS_PATH = fileURLToPath(new URL('../src/styles/globals.css', import.meta.url))

/** Tokens de `:root` → { nombre: { L, C, h, alpha } } */
export function parseTokens(css = readFileSync(CSS_PATH, 'utf8')) {
  const root = css.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? ''
  const tokens = {}
  for (const [, name, L, C, h, alpha] of root.matchAll(/--([\w-]+):\s*oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/g)) {
    tokens[name] = { L: +L, C: +C, h: +h, alpha: alpha === undefined ? 1 : alpha.endsWith('%') ? parseFloat(alpha) / 100 : +alpha }
  }
  return tokens
}

const clamp01 = (x) => Math.min(1, Math.max(0, x))
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

/** oklch → sRGB lineal [0, 1] */
export function oklchToLinearRgb({ L, C, h }) {
  const rad = (h * Math.PI) / 180
  const a = C * Math.cos(rad)
  const b = C * Math.sin(rad)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** Color efectivo de `fg` (con su alfa y un alfa extra opcional) sobre `bg` opaco, en sRGB lineal. */
export function composite(fg, bg, extraAlpha = 1) {
  const alpha = fg.alpha * extraAlpha
  const top = oklchToLinearRgb(fg).map(toGamma)
  const bottom = oklchToLinearRgb(bg).map(toGamma)
  return top.map((c, i) => toLinear(alpha * c + (1 - alpha) * bottom[i]))
}

export const luminance = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

export function contrastRatio(fgLinear, bgLinear) {
  const [hi, lo] = [luminance(fgLinear), luminance(bgLinear)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Combinaciones realmente usadas en la interfaz.
 * [primer plano, fondo, mínimo, uso, alfa extra del primer plano]
 */
export const PAIRS = [
  // Texto normal (4.5:1)
  ['foreground', 'background', 4.5, 'Texto principal'],
  ['foreground', 'card', 4.5, 'Texto en tarjetas'],
  ['muted-foreground', 'background', 4.5, 'Texto secundario'],
  ['muted-foreground', 'card', 4.5, 'Texto secundario en tarjetas'],
  ['muted-foreground', 'muted', 4.5, 'Texto secundario sobre superficie atenuada'],
  ['muted-foreground', 'sidebar', 4.5, 'Texto secundario del menú'],
  ['primary', 'background', 4.5, 'Enlaces'],
  ['primary', 'card', 4.5, 'Enlaces en tarjetas'],
  ['primary-foreground', 'primary', 4.5, 'Botón principal / escala seleccionada'],
  ['secondary-foreground', 'secondary', 4.5, 'Insignias secundarias'],
  ['accent-foreground', 'accent', 4.5, 'Elemento con hover'],
  ['popover-foreground', 'popover', 4.5, 'Listas desplegables'],
  ['sidebar-foreground', 'sidebar', 4.5, 'Menú lateral'],
  ['sidebar-accent-foreground', 'sidebar-accent', 4.5, 'Menú: vista activa'],
  ['sidebar-primary-foreground', 'sidebar-primary', 4.5, 'Logotipo del menú'],
  ['destructive', 'background', 4.5, 'Mensajes de error'],
  ['destructive', 'card', 4.5, 'Mensajes de error en tarjetas y alertas'],
  ['destructive', 'card', 4.5, 'Descripción de alerta de error (90 %)', 0.9],
  // Componentes, indicadores y foco (3:1, WCAG 1.4.11)
  ['ring', 'background', 3, 'Contorno de foco'],
  ['ring', 'card', 3, 'Contorno de foco en tarjetas'],
  ['input', 'background', 3, 'Borde de campos de formulario'],
  ['input', 'card', 3, 'Borde de campos de formulario en tarjetas'],
  ['primary', 'card', 3, 'Escala seleccionada frente a la tarjeta'],
  ['success', 'card', 3, 'Indicador de estado: correcto'],
  ['warning', 'card', 3, 'Indicador de estado: aviso'],
  ['info', 'card', 3, 'Indicador de estado: información'],
  ['destructive', 'card', 3, 'Indicador de estado: error'],
  ['muted-foreground', 'card', 3, 'Indicador de estado: neutro'],
  ['chart-1', 'card', 3, 'Serie de gráfico 1'],
  ['chart-2', 'card', 3, 'Serie de gráfico 2'],
  ['chart-3', 'card', 3, 'Serie de gráfico 3'],
  ['chart-4', 'card', 3, 'Serie de gráfico 4'],
  ['chart-5', 'card', 3, 'Serie de gráfico 5'],
]

export function evaluate(tokens = parseTokens()) {
  return PAIRS.map(([fg, bg, min, usage, extraAlpha = 1]) => {
    if (!tokens[fg] || !tokens[bg]) return { fg, bg, min, usage, ratio: 0, pass: false, error: 'token inexistente' }
    const ratio = contrastRatio(composite(tokens[fg], tokens[bg], extraAlpha), composite(tokens[bg], tokens[bg]))
    return { fg, bg, min, usage, ratio: Math.round(ratio * 100) / 100, pass: ratio >= min }
  })
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = evaluate()
  for (const r of results) {
    console.log(`${r.pass ? '✔' : '✘'} ${r.ratio.toFixed(2).padStart(6)}:1 (mín. ${r.min})  ${r.fg} sobre ${r.bg} — ${r.usage}`)
  }
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} combinaciones cumplen WCAG 2.2 AA.`)
  process.exitCode = failed.length ? 1 : 0
}
