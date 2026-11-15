import { Timer } from 'lucide-react'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@astronaut-wellness/ui/components/ui/table'
import { EmptyState } from '@astronaut-wellness/ui/components/empty-state'
import { SourceBadge } from '@astronaut-wellness/ui/components/source-badge'
import { MISSING_TEXT, formatNumber, formatUtc } from '@astronaut-wellness/ui/lib/format'

const ms = (value) => (value === null || value === undefined ? MISSING_TEXT : `${formatNumber(value, { decimals: 0 })} ms`)

/**
 * Resultados de la prueba de vigilancia psicomotora (PVT). Descriptivos: no se
 * comparan con normas ni se interpretan clínicamente.
 */
export function VigilanceTestTable({
  tests = [],
  caption = 'Pruebas de vigilancia psicomotora (PVT)',
  emptyTitle = 'Sin pruebas de vigilancia',
  emptyDescription = 'Todavía no se ha registrado ninguna prueba.',
}) {
  if (tests.length === 0) return <EmptyState icon={Timer} title={emptyTitle} description={emptyDescription} />

  return (
    <Table>
      <TableCaption>
        {caption}. Lapso: respuesta ≥ umbral del protocolo; falsa salida: respuesta anticipada; omisión: sin respuesta.
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Fecha (UTC)</TableHead>
          <TableHead scope="col">Protocolo</TableHead>
          <TableHead scope="col">Ensayos</TableHead>
          <TableHead scope="col">TR medio</TableHead>
          <TableHead scope="col">TR mediano</TableHead>
          <TableHead scope="col">Lapsos</TableHead>
          <TableHead scope="col">Falsas salidas</TableHead>
          <TableHead scope="col">Omisiones</TableHead>
          <TableHead scope="col">Origen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tests.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="whitespace-nowrap">{formatUtc(t.recordedAt, { seconds: false })}</TableCell>
            <TableCell className="whitespace-nowrap">
              {t.protocol.name} · {t.protocol.durationSeconds} s
              <span className="block text-xs text-muted-foreground">lapso ≥ {t.protocol.lapseThresholdMs} ms</span>
            </TableCell>
            <TableCell className="tabular-nums">{t.summary.trialCount}</TableCell>
            <TableCell className="tabular-nums">{ms(t.summary.meanReactionTimeMs)}</TableCell>
            <TableCell className="tabular-nums">{ms(t.summary.medianReactionTimeMs)}</TableCell>
            <TableCell className="tabular-nums">{t.summary.lapseCount}</TableCell>
            <TableCell className="tabular-nums">{t.summary.falseStartCount}</TableCell>
            <TableCell className="tabular-nums">{t.summary.timeoutCount}</TableCell>
            <TableCell>
              <SourceBadge source={t.source} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
