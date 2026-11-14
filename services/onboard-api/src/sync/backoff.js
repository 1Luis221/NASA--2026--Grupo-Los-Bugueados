/**
 * Espera antes del reintento número `attempt` (1, 2, 3…): crecimiento
 * exponencial limitado por `maxMs`. Sin jitter: hay un único emisor por nodo
 * y así el comportamiento es determinista en los tests.
 */
export function computeBackoffMs(attempt, { baseMs, maxMs, factor = 2 }) {
  if (attempt < 1) return 0
  return Math.min(maxMs, baseMs * factor ** (attempt - 1))
}
