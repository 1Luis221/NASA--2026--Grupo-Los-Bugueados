/**
 * Almacén en memoria de registros de un tipo de entidad, compatible con
 * useSyncExternalStore. Recibe datos de dos fuentes (HTTP y Socket.IO) y
 * los FUSIONA por UUID; nunca reemplaza la colección completa, así que:
 *
 * - Un evento repetido o una recarga tras reconectar no duplica registros.
 * - Una respuesta HTTP antigua que llega después de un evento más reciente no
 *   lo deshace: gana la versión con `updatedAt` (o marca temporal) más reciente.
 * - Se conservan como máximo `limit` registros (por grupo si hay `groupBy`),
 *   descartando los más antiguos.
 */
export function createRecordStore({
  limit = 500,
  groupBy,
  timestampOf = (r) => r.recordedAt ?? r.createdAt ?? r.updatedAt,
  versionOf = (r) => r.updatedAt ?? timestampOf(r),
} = {}) {
  const records = new Map()
  const listeners = new Set()
  let snapshot = []

  const time = (iso) => {
    const t = Date.parse(iso ?? '')
    return Number.isNaN(t) ? -Infinity : t
  }

  /** true si `incoming` debe sustituir a `existing` (last-write-wins). */
  function shouldReplace(incoming, existing) {
    if (!existing) return true
    if (time(versionOf(incoming)) < time(versionOf(existing))) return false
    return JSON.stringify(incoming) !== JSON.stringify(existing)
  }

  function rebuild() {
    const sorted = [...records.values()].sort((a, b) => time(timestampOf(b)) - time(timestampOf(a)))
    const counts = new Map()
    const kept = []
    for (const record of sorted) {
      const group = groupBy ? record[groupBy] : '*'
      const count = counts.get(group) ?? 0
      if (count < limit) {
        kept.push(record)
        counts.set(group, count + 1)
      } else {
        records.delete(record.id)
      }
    }
    snapshot = kept
  }

  return {
    /** Fusiona registros. Devuelve true si algo cambió (y notifica). */
    upsertMany(list) {
      let changed = false
      for (const record of list ?? []) {
        if (!record?.id || !shouldReplace(record, records.get(record.id))) continue
        records.set(record.id, record)
        changed = true
      }
      if (changed) {
        rebuild()
        listeners.forEach((listener) => listener())
      }
      return changed
    },
    /** Vacía el almacén (p. ej. tras detectar que Ground API se reinició). Devuelve cuántos había. */
    clear() {
      const discarded = records.size
      if (discarded === 0) return 0
      records.clear()
      snapshot = []
      listeners.forEach((listener) => listener())
      return discarded
    },
    get: (id) => records.get(id),
    /** Registros más recientes primero. Referencia estable mientras no haya cambios. */
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    size: () => records.size,
  }
}
