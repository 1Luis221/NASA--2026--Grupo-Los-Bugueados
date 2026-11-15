import { AlertStrictSchema, canTransitionAlertStatus } from '@astronaut-wellness/shared'
import { RECORD_RULES, STALE_RULES, evidenceOf, resolveRules } from '../alerts/demo-rules.js'

const MAX_EVIDENCE = 20
const OPEN = (a) => a.status !== 'resolved'

/**
 * Alertas OPERATIVAS generadas a bordo:
 * - Comunicaciones: pérdida y recuperación del enlace.
 * - Reglas de DEMOSTRACIÓN sobre registros (PVT, somnolencia autodeclarada) y
 *   de calidad de datos (ver alerts/demo-rules.js). Sin diagnósticos.
 *
 * Deduplicación:
 * - Como máximo UNA alerta abierta por `dedupKey` (regla + tripulante). Si la
 *   condición se repite, se ACTUALIZA esa alerta (nueva evidencia) en lugar de
 *   crear otra; si deja de cumplirse, se resuelve.
 * - Cada registro se evalúa una sola vez por regla.
 * - Toda alerta viaja a Tierra como SyncEvent (create/update) con su id: los
 *   reintentos del enlace no la duplican (idempotencia por id de evento y de alerta).
 */
export function createAlertService({ alertStore, queue, clock, generateId, rules = resolveRules() }) {
  let linkAlertId = null
  const evaluated = new Set() // `${ruleId}:${recordId}`

  function save(alert, operation) {
    const parsed = alertStore.save(AlertStrictSchema.parse(alert))
    queue.enqueue({ entityType: 'alert', operation, payload: parsed })
    return parsed
  }

  function resolve(id) {
    const alert = alertStore.get(id)
    if (!alert || !canTransitionAlertStatus(alert.status, 'resolved')) return alert
    const now = clock.now().toISOString()
    return save({ ...alert, status: 'resolved', resolvedAt: now, updatedAt: now }, 'update')
  }

  const openByKey = (dedupKey) => alertStore.list({ filter: (a) => a.dedupKey === dedupKey && OPEN(a), limit: 1 })[0] ?? null

  /** Abre la alerta de `dedupKey` o, si ya está abierta, le añade la evidencia nueva. */
  function raise({ dedupKey, crewMemberId, rule, category, severity, title, message, evidence = [], relatedRecord }) {
    const existing = openByKey(dedupKey)
    const now = clock.now().toISOString()
    if (existing) {
      const known = new Set((existing.evidence ?? []).map((e) => e.id))
      // Sin evidencia nueva no se toca (p. ej. la comprobación periódica de datos desactualizados).
      if (evidence.every((e) => known.has(e.id))) return existing
      const merged = [...evidence, ...(existing.evidence ?? []).filter((e) => !evidence.some((n) => n.id === e.id))].slice(0, MAX_EVIDENCE)
      return save({ ...existing, rule, title, message, evidence: merged, ...(relatedRecord && { relatedRecord }), updatedAt: now }, 'update')
    }
    return save(
      {
        id: generateId(),
        crewMemberId,
        origin: 'onboard',
        category,
        severity,
        status: 'active',
        title,
        message,
        rule,
        ...(evidence.length && { evidence: evidence.slice(0, MAX_EVIDENCE) }),
        ...(relatedRecord && { relatedRecord }),
        dedupKey,
        createdAt: now,
        updatedAt: now,
      },
      'create',
    )
  }

  function clear(dedupKey) {
    const existing = openByKey(dedupKey)
    return existing ? resolve(existing.id) : null
  }

  return {
    rules,

    list: ({ status, severity, category, crewMemberId, limit }) =>
      alertStore.list({
        filter: (a) =>
          (!status || a.status === status) &&
          (!severity || a.severity === severity) &&
          (!category || a.category === category) &&
          (!crewMemberId || a.crewMemberId === crewMemberId),
        limit,
      }),

    /** Listener de cambios del enlace: abre una alerta al perderlo y la resuelve al recuperarlo. */
    handleLinkChange({ previous, current }) {
      if (current === 'disconnected' && !linkAlertId) {
        const now = clock.now().toISOString()
        linkAlertId = save(
          {
            id: generateId(),
            origin: 'onboard',
            category: 'communication',
            severity: 'warning',
            status: 'active',
            title: 'Enlace nave–Tierra interrumpido',
            message: 'Los datos se conservan en la cola local y se enviarán al recuperar el enlace.',
            createdAt: now,
            updatedAt: now,
          },
          'create',
        ).id
      } else if (previous === 'disconnected' && current !== 'disconnected' && linkAlertId) {
        resolve(linkAlertId)
        linkAlertId = null
      }
    },

    /**
     * Evalúa las reglas de demostración de un registro recién creado.
     * `context.previousTests`: PVT anteriores del mismo tripulante (más recientes primero).
     * Devuelve las alertas creadas, actualizadas o resueltas.
     */
    evaluateRecord(entityType, record, context = {}) {
      const changed = []
      for (const rule of RECORD_RULES[entityType] ?? []) {
        const cfg = rules[rule.configKey]
        const once = `${rule.id}:${record.id}`
        if (!cfg?.enabled || evaluated.has(once)) continue
        evaluated.add(once)
        const result = rule.evaluate(record, context, cfg)
        if (result.skip || result.insufficient) continue
        const dedupKey = `${rule.id}:${record.crewMemberId}`
        const ruleInfo = { id: rule.id, name: rule.name, demonstrative: true, parameters: result.parameters }
        const alert = result.fire
          ? raise({
              dedupKey,
              crewMemberId: record.crewMemberId,
              rule: ruleInfo,
              category: rule.category,
              severity: 'warning',
              title: result.title,
              message: result.message,
              evidence: result.evidence,
              relatedRecord: { entityType, id: record.id },
            })
          : clear(dedupKey) // el último registro ya no cumple la condición
        if (alert) changed.push(alert)
      }
      return changed
    },

    /**
     * Calidad de datos (evaluación periódica): por cada tripulante activo, abre
     * una alerta `data_quality` si no hay registros recientes y la resuelve
     * cuando vuelven a llegar. `latestOf(entityType, crewMemberId)` → registro | null.
     * Sin ningún registro, la antigüedad se cuenta desde `since` (arranque del servicio).
     */
    checkStaleness({ crew, latestOf, since }) {
      const cfg = rules.staleData
      if (!cfg?.enabled) return []
      const now = clock.now()
      const changed = []
      for (const member of crew.filter((c) => c.status === 'active')) {
        for (const rule of STALE_RULES) {
          const latest = latestOf(rule.entityType, member.id)
          const reference = latest ? Date.parse(latest.recordedAt) : Date.parse(since)
          const ageMinutes = Math.round((now - reference) / 60_000)
          const dedupKey = `${rule.id}:${member.id}`
          const alert =
            now - reference > rule.maxAgeMs(cfg)
              ? raise({
                  dedupKey,
                  crewMemberId: member.id,
                  rule: { id: rule.id, name: rule.name, demonstrative: true, parameters: rule.parameters(cfg) },
                  category: 'data_quality',
                  severity: 'info',
                  title: `Sin ${rule.label} recientes de ${member.name}`.slice(0, 120),
                  message: latest
                    ? `Último registro: ${latest.recordedAt} (hace ${ageMinutes} min). Es un aviso de calidad de datos, no de bienestar.`
                    : `No se ha recibido ningún registro desde ${since} (${ageMinutes} min). Es un aviso de calidad de datos, no de bienestar.`,
                  evidence: latest ? [evidenceOf(rule.entityType, latest, `Último registro de ${rule.label}`)] : [],
                })
              : clear(dedupKey)
          if (alert) changed.push(alert)
        }
      }
      return changed
    },
  }
}
