import { createContext, useContext } from 'react'

/**
 * Estado compartido de la interfaz a bordo (ver AppProviders.jsx):
 * - api: cliente de Onboard API.
 * - crew / selection: tripulación y tripulante seleccionado (no es autenticación).
 * - sync: estado del enlace simulado y de la cola, con sondeo único cada ~3 s.
 */
export const OnboardContext = createContext(null)

export function useOnboard() {
  const context = useContext(OnboardContext)
  if (!context) throw new Error('useOnboard requiere <AppProviders>')
  return context
}

export const useOnboardApi = () => useOnboard().api
export const useCrewSelection = () => useOnboard().selection
export const useSyncState = () => useOnboard().sync
