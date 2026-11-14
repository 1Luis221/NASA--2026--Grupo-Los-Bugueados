/**
 * Almacén en memoria indexado por `id`. Los datos se pierden al reiniciar
 * el proceso (sin base de datos en esta fase).
 */
export function createMemoryStore() {
  const items = new Map()

  return {
    save(item) {
      items.set(item.id, item)
      return item
    },
    get: (id) => items.get(id),
    has: (id) => items.has(id),
    /** Más recientes primero. `filter` y `limit` son opcionales. */
    list({ filter = () => true, limit } = {}) {
      const result = [...items.values()].filter(filter).reverse()
      return limit ? result.slice(0, limit) : result
    },
    size: () => items.size,
    clear: () => items.clear(),
  }
}
