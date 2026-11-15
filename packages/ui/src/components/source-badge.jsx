import { FlaskConical } from 'lucide-react'
import { Badge } from '@astronaut-wellness/ui/components/ui/badge'
import { describeSource } from '@astronaut-wellness/ui/lib/format'

/**
 * Etiqueta visible del origen de un dato. Las lecturas simuladas SIEMPRE se
 * marcan como "Simulado" para no presentarlas como mediciones reales.
 */
export function SourceBadge({ source, className }) {
  if (!source) return null
  const description = describeSource(source)
  return source.simulated ? (
    <Badge variant="outline" className={className} title={description}>
      <FlaskConical aria-hidden="true" />
      Simulado
    </Badge>
  ) : (
    <Badge variant="secondary" className={className} title={description}>
      Dato real
    </Badge>
  )
}
