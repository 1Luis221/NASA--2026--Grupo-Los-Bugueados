// Utilidades
export { cn } from './lib/utils.js'
export * from './lib/format.js'
export * from './lib/crew.js'
export * from './lib/labels.js'
export * from './lib/vitals.js'
export * from './lib/wellness.js'
export * from './lib/dimensions.js'

// Capa de datos (cliente HTTP y hooks)
export { ApiError, buildUrl, createApiClient, isAbortError } from './data/api-client.js'
export { useResource, isEmptyPayload } from './data/use-resource.js'
export { usePolling } from './data/use-polling.js'
export { useNow } from './data/use-now.js'

// Componentes base de shadcn/ui (JSX)
export { Alert, AlertTitle, AlertDescription } from './components/ui/alert.jsx'
export { Badge, badgeVariants } from './components/ui/badge.jsx'
export { Button, buttonVariants } from './components/ui/button.jsx'
export { Card, CardHeader, CardTitle, CardDescription, CardAction, CardContent, CardFooter } from './components/ui/card.jsx'
export { Input } from './components/ui/input.jsx'
export { Label } from './components/ui/label.jsx'
export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from './components/ui/select.jsx'
export { Skeleton } from './components/ui/skeleton.jsx'
export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption } from './components/ui/table.jsx'
export { Textarea } from './components/ui/textarea.jsx'

// Componentes de interfaz propios
export { AppShell } from './components/app-shell.jsx'
export { Sidebar } from './components/sidebar.jsx'
export { Header } from './components/header.jsx'
export { MetricCard } from './components/metric-card.jsx'
export { StatusIndicator } from './components/status-indicator.jsx'
export { LoadingState } from './components/loading-state.jsx'
export { EmptyState } from './components/empty-state.jsx'
export { ErrorState } from './components/error-state.jsx'
export { PageSection } from './components/page-section.jsx'

// Componentes de datos compartidos por Ground Control y Onboard
export { SourceBadge } from './components/source-badge.jsx'
export { VitalSignsChart } from './components/vital-signs-chart.jsx'
export { VitalSignsSummary } from './components/vital-signs-summary.jsx'
export { AlertList } from './components/alert-list.jsx'
export { CrewCard } from './components/crew-card.jsx'
export { WellnessSummary } from './components/wellness-summary.jsx'
export { CheckInTable } from './components/check-in-table.jsx'
export { CameraMetricsTable } from './components/camera-metrics-table.jsx'
export { VigilanceTestTable } from './components/vigilance-test-table.jsx'
export { DimensionPanel } from './components/dimension-panel.jsx'
