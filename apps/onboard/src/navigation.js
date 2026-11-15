import { Camera, ClipboardList, FlaskConical, HeartPulse, Home, RefreshCw, Rocket, Timer } from 'lucide-react'

export const BRAND = Object.freeze({
  name: 'Astronaut Wellness System',
  subtitle: 'Onboard',
  icon: Rocket,
})

/**
 * Vistas de la interfaz a bordo. La de simulación solo existe en desarrollo
 * (`import.meta.env.DEV`); en el build de producción no aparece.
 */
export function getNavItems({ devTools = import.meta.env.DEV } = {}) {
  return [
    { to: '/', label: 'Inicio', icon: Home, end: true },
    { to: '/vitals', label: 'Signos vitales', icon: HeartPulse },
    { to: '/check-in', label: 'Autoevaluación', icon: ClipboardList },
    { to: '/sync', label: 'Sincronización', icon: RefreshCw },
    { to: '/camera', label: 'Cámara', icon: Camera },
    { to: '/vigilance', label: 'Vigilancia', icon: Timer },
    ...(devTools ? [{ to: '/simulation', label: 'Simulación', icon: FlaskConical }] : []),
  ]
}
