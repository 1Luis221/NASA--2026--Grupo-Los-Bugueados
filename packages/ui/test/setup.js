import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Sin globals de Vitest, React Testing Library no limpia sola entre pruebas.
afterEach(() => cleanup())

// APIs de puntero que Radix UI (Select) usa y jsdom no implementa.
// (Las pruebas de herramientas de Node usan el entorno `node`, sin DOM.)
const hasDom = typeof Element !== 'undefined'
if (hasDom && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
  Element.prototype.setPointerCapture = () => {}
  Element.prototype.releasePointerCapture = () => {}
}
if (hasDom && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}

// Recharts (ResponsiveContainer) observa el tamaño del contenedor; jsdom no implementa ResizeObserver.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
