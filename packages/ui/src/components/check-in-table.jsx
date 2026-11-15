import { ClipboardList } from 'lucide-react'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@astronaut-wellness/ui/components/ui/table'
import { EmptyState } from '@astronaut-wellness/ui/components/empty-state'
import { SourceBadge } from '@astronaut-wellness/ui/components/source-badge'
import { MISSING_TEXT, formatLocal, formatMeasurement, formatUtc } from '@astronaut-wellness/ui/lib/format'
import { CHECK_IN_SCALES } from '@astronaut-wellness/ui/lib/labels'

/**
 * Historial de autoevaluaciones (escalas 1–5) en una tabla accesible.
 * `extraColumn` ({ header, render(checkIn) }) añade una columna propia de cada app.
 */
export function CheckInTable({
  checkIns = [],
  caption = 'Autoevaluaciones',
  renderCrew,
  extraColumn,
  emptyTitle = 'Sin autoevaluaciones',
  emptyDescription = 'Todavía no se ha recibido ninguna autoevaluación.',
}) {
  if (checkIns.length === 0) return <EmptyState icon={ClipboardList} title={emptyTitle} description={emptyDescription} />

  return (
    <Table>
      <TableCaption>{caption}. Escalas 1–5; el significado de los extremos se indica en cada columna.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Fecha (UTC)</TableHead>
          {renderCrew && <TableHead scope="col">Tripulante</TableHead>}
          {CHECK_IN_SCALES.map(({ key, label, low, high }) => (
            <TableHead key={key} scope="col" title={`1 = ${low} · 5 = ${high}`}>
              {label}{' '}
              <span className="sr-only">(1 = {low}, 5 = {high})</span>
            </TableHead>
          ))}
          <TableHead scope="col">Sueño</TableHead>
          <TableHead scope="col">Notas</TableHead>
          <TableHead scope="col">Origen</TableHead>
          {extraColumn && <TableHead scope="col">{extraColumn.header}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {checkIns.map((checkIn) => (
          <TableRow key={checkIn.id}>
            <TableCell>
              <time dateTime={checkIn.recordedAt} title={formatLocal(checkIn.recordedAt)} className="whitespace-nowrap">
                {formatUtc(checkIn.recordedAt, { seconds: false })}
              </time>
            </TableCell>
            {renderCrew && <TableCell>{renderCrew(checkIn.crewMemberId)}</TableCell>}
            {CHECK_IN_SCALES.map(({ key }) => (
              <TableCell key={key} className="tabular-nums">
                {checkIn[key]} / 5
              </TableCell>
            ))}
            <TableCell className="tabular-nums">{formatMeasurement(checkIn.sleepDuration, { decimals: 1 })}</TableCell>
            <TableCell className="max-w-64 whitespace-normal text-muted-foreground">{checkIn.notes ?? MISSING_TEXT}</TableCell>
            <TableCell>
              <SourceBadge source={checkIn.source} />
            </TableCell>
            {extraColumn && <TableCell>{extraColumn.render(checkIn)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
