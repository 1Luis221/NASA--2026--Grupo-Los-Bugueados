import { Camera } from 'lucide-react'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@astronaut-wellness/ui/components/ui/table'
import { EmptyState } from '@astronaut-wellness/ui/components/empty-state'
import { SourceBadge } from '@astronaut-wellness/ui/components/source-badge'
import { MISSING_TEXT, formatMeasurement, formatNumber, formatUtc } from '@astronaut-wellness/ui/lib/format'

const angle = (pose, key) => (pose?.[key] ? `${formatNumber(pose[key].value, { decimals: 0 })}°` : MISSING_TEXT)

/**
 * Métricas AGREGADAS de cámara por ventana (nunca imágenes). Son indicadores
 * experimentales del modelo de visión, no mediciones clínicas.
 */
export function CameraMetricsTable({
  metrics = [],
  caption = 'Métricas agregadas de cámara (sin imágenes)',
  emptyTitle = 'Sin métricas de cámara',
  emptyDescription = 'Todavía no se han registrado métricas de cámara.',
}) {
  if (metrics.length === 0) return <EmptyState icon={Camera} title={emptyTitle} description={emptyDescription} />

  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Fin de ventana (UTC)</TableHead>
          <TableHead scope="col">Ventana</TableHead>
          <TableHead scope="col">Rostro</TableHead>
          <TableHead scope="col">Parpadeo</TableHead>
          <TableHead scope="col">Ojos cerrados</TableHead>
          <TableHead scope="col">Bostezos</TableHead>
          <TableHead scope="col">Cabeza (cabeceo/giro/inclinación)</TableHead>
          <TableHead scope="col">Modelo</TableHead>
          <TableHead scope="col">Origen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {metrics.map((m) => (
          <TableRow key={m.id}>
            <TableCell className="whitespace-nowrap">{formatUtc(m.recordedAt)}</TableCell>
            <TableCell>{formatMeasurement(m.windowDuration)}</TableCell>
            <TableCell>{m.faceDetected ? 'Detectado' : 'No detectado'}</TableCell>
            <TableCell>{formatMeasurement(m.blinkRate, { decimals: 0 })}</TableCell>
            <TableCell>{m.eyeClosureRatio ? `${formatNumber(m.eyeClosureRatio.value * 100, { decimals: 0 })} % de la ventana` : MISSING_TEXT}</TableCell>
            <TableCell>{formatMeasurement(m.yawnCount)}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {m.headPose ? `${angle(m.headPose, 'pitch')} / ${angle(m.headPose, 'yaw')} / ${angle(m.headPose, 'roll')}` : MISSING_TEXT}
            </TableCell>
            <TableCell className="text-xs">{m.model ? `${m.model.name} ${m.model.version}` : MISSING_TEXT}</TableCell>
            <TableCell>
              <SourceBadge source={m.source} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
