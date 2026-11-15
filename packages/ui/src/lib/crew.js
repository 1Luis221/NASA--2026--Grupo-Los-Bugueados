/**
 * Resolución de tripulantes para la interfaz.
 *
 * Ground API puede tener mediciones de un tripulante cuyo perfil aún no ha
 * recibido (p. ej. tras reiniciarse). En ese caso se muestra
 * "Tripulante desconocido" con su identificador real: NUNCA se inventan
 * nombre, agencia, rol ni estado.
 */

export const UNKNOWN_CREW_LABEL = 'Tripulante desconocido'

export const shortId = (id) => (typeof id === 'string' ? id.slice(0, 8) : '')

/** Perfil conocido → { known: true, ...perfil, displayName }. Desconocido → solo el id. */
export function resolveCrewMember(id, crewById) {
  const profile = crewById?.get?.(id) ?? crewById?.[id]
  // Un miembro ya resuelto (con `known`) se devuelve tal cual: no es un perfil del contrato.
  if (profile && typeof profile.known === 'boolean') return profile
  if (profile) {
    return { ...profile, known: true, displayName: profile.callsign ? `${profile.name} (${profile.callsign})` : profile.name }
  }
  return { id, known: false, displayName: `${UNKNOWN_CREW_LABEL} · ${shortId(id)}` }
}

/**
 * Lista de tripulantes a mostrar: los perfiles recibidos más los
 * identificadores que solo aparecen en registros reales (`records` con
 * `crewMemberId`), marcados como desconocidos. Sin duplicados.
 */
export function collectCrew(crewProfiles = [], ...recordLists) {
  const crewById = new Map(crewProfiles.map((member) => [member.id, member]))
  const result = crewProfiles.map((member) => resolveCrewMember(member.id, crewById))
  const seen = new Set(crewById.keys())

  for (const records of recordLists) {
    for (const record of records ?? []) {
      const id = record?.crewMemberId
      if (id && !seen.has(id)) {
        seen.add(id)
        result.push(resolveCrewMember(id, crewById))
      }
    }
  }
  return result
}
