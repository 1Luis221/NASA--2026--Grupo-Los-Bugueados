import { Bell, LayoutDashboard, RefreshCw, Satellite, Users } from 'lucide-react'

export const BRAND = Object.freeze({
  name: 'Astronaut Wellness System',
  subtitle: 'Ground Control',
  icon: Satellite,
})

/** Vistas de Ground Control (el detalle de un tripulante cuelga de /crew/:id). */
export const NAV_ITEMS = Object.freeze([
  { to: '/', label: 'Panel principal', icon: LayoutDashboard, end: true },
  { to: '/crew', label: 'Tripulación', icon: Users },
  { to: '/alerts', label: 'Alertas', icon: Bell },
  { to: '/sync', label: 'Sincronización', icon: RefreshCw },
])
