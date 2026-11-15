import { Suspense, lazy } from 'react'
import { CloudOff, MapPinOff, UserRoundX } from 'lucide-react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle, AppShell, EmptyState, LoadingState, formatUtc, shortId } from '@astronaut-wellness/ui'
import { CrewSelector } from './components/CrewSelector.jsx'
import { LinkStatus } from './components/LinkStatus.jsx'
import { BRAND, getNavItems } from './navigation.js'
import { useOnboard } from './state/app-context.js'

// Cada pantalla se carga al visitarla (la de signos vitales incluye Recharts).
const page = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })))
const HomePage = page(() => import('./pages/HomePage.jsx'), 'HomePage')
const VitalsPage = page(() => import('./pages/VitalsPage.jsx'), 'VitalsPage')
const CheckInPage = page(() => import('./pages/CheckInPage.jsx'), 'CheckInPage')
const SyncPage = page(() => import('./pages/SyncPage.jsx'), 'SyncPage')
const CameraPage = page(() => import('./pages/CameraPage.jsx'), 'CameraPage')
// Solo en desarrollo: en producción ni siquiera se genera el fragmento de esta página.
const SimulationPage = import.meta.env.DEV ? page(() => import('./pages/SimulationPage.jsx'), 'SimulationPage') : null

const PAGES = {
  '/': { element: <HomePage />, description: 'Resumen del tripulante y del estado de la nave' },
  '/vitals': { element: <VitalsPage />, description: 'Mediciones simuladas con unidades, fecha y origen' },
  '/check-in': { element: <CheckInPage />, description: 'Registro de cómo te encuentras' },
  '/sync': { element: <SyncPage />, description: 'Enlace simulado y cola de envíos a Tierra' },
  '/camera': { element: <CameraPage />, description: 'Análisis por cámara (pendiente)' },
  ...(SimulationPage && {
    '/simulation': { element: <SimulationPage />, description: 'Controles de demostración (solo desarrollo)' },
  }),
}

function App() {
  const { pathname } = useLocation()
  const { devTools, selection, sync } = useOnboard()
  // Una vista solo existe si su página está incluida en este build.
  const navItems = getNavItems({ devTools }).filter((item) => PAGES[item.to])
  const current = navItems.find((item) => item.to === pathname)

  return (
    <AppShell
      sidebar={{ brand: BRAND, items: navItems, linkComponent: NavLink, footer: 'Fuente de datos: Onboard API' }}
      header={{
        title: current?.label ?? 'Página no encontrada',
        description: current ? PAGES[current.to].description : 'Interfaz de la tripulación',
        actions: (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <CrewSelector />
            <LinkStatus live />
          </div>
        ),
      }}
    >
      <div className="mx-auto max-w-screen-2xl space-y-6">
        {selection.missingId && (
          <Alert>
            <UserRoundX aria-hidden="true" />
            <AlertTitle>El tripulante guardado ya no existe</AlertTitle>
            <AlertDescription>
              Este navegador recordaba al tripulante {shortId(selection.missingId)}, pero Onboard API ya no lo tiene. Selecciona otro.
            </AlertDescription>
          </Alert>
        )}
        {sync.error && sync.updatedAt && (
          <Alert>
            <CloudOff aria-hidden="true" />
            <AlertTitle>Sin respuesta de Onboard API</AlertTitle>
            <AlertDescription>
              Los datos mostrados pueden estar desactualizados. Última respuesta: {formatUtc(sync.updatedAt)}. Se reintenta
              automáticamente.
            </AlertDescription>
          </Alert>
        )}
        <Suspense fallback={<LoadingState label="Cargando vista…" rows={4} />}>
          <Routes>
            {/* Las rutas salen del menú: /simulation solo existe en desarrollo. */}
            {navItems.map((item) => (
              <Route key={item.to} path={item.to} element={PAGES[item.to].element} />
            ))}
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
