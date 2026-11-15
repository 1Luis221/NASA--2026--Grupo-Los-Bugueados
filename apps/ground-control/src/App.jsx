import { Suspense, lazy } from 'react'
import { MapPinOff } from 'lucide-react'
import { NavLink, Route, Routes, matchPath, useLocation } from 'react-router-dom'
import { AppShell, EmptyState, LoadingState } from '@astronaut-wellness/ui'
import { DataFreshnessNotice } from './components/DataFreshnessNotice.jsx'
import { RealtimeStatus } from './components/RealtimeStatus.jsx'
import { BRAND, NAV_ITEMS } from './navigation.js'

// Cada pantalla se carga al visitarla: el detalle incluye Recharts y las tablas/filtros
// no son necesarios para pintar la estructura principal.
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })))
const DashboardPage = page(() => import('./pages/DashboardPage.jsx'), 'DashboardPage')
const CrewPage = page(() => import('./pages/CrewPage.jsx'), 'CrewPage')
const CrewDetailPage = page(() => import('./pages/CrewDetailPage.jsx'), 'CrewDetailPage')
const AlertsPage = page(() => import('./pages/AlertsPage.jsx'), 'AlertsPage')
const SyncPage = page(() => import('./pages/SyncPage.jsx'), 'SyncPage')

const DESCRIPTIONS = {
  '/': 'Resumen de lo recibido de la nave',
  '/crew': 'Perfiles y mediciones por tripulante',
  '/crew/:id': 'Perfil, signos vitales, autoevaluaciones y alertas',
  '/alerts': 'Alertas recibidas por Ground API',
  '/sync': 'Recepción de datos y conexiones',
}

function useHeader(pathname) {
  if (matchPath('/crew/:id', pathname)) return { title: 'Detalle del tripulante', description: DESCRIPTIONS['/crew/:id'] }
  const item = NAV_ITEMS.find((i) => i.to === pathname)
  return item
    ? { title: item.label, description: DESCRIPTIONS[item.to] }
    : { title: 'Página no encontrada', description: 'Centro de control terrestre' }
}

function App() {
  const { pathname } = useLocation()
  const header = useHeader(pathname)

  return (
    <AppShell
      sidebar={{ brand: BRAND, items: NAV_ITEMS, linkComponent: NavLink, footer: 'Fuente de datos: Ground API' }}
      header={{ ...header, actions: <RealtimeStatus live /> }}
    >
      <div className="mx-auto max-w-screen-2xl space-y-6">
        <DataFreshnessNotice />
        <Suspense fallback={<LoadingState label="Cargando vista…" rows={4} />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/crew" element={<CrewPage />} />
            <Route path="/crew/:id" element={<CrewDetailPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/sync" element={<SyncPage />} />
            <Route
              path="*"
              element={<EmptyState icon={MapPinOff} title="Página no encontrada" description="Usa el menú para ir a una vista disponible." />}
            />
          </Routes>
        </Suspense>
      </div>
    </AppShell>
  )
}

export default App
