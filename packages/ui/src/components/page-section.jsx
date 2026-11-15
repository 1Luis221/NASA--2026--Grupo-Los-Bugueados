import { useId } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@astronaut-wellness/ui/components/ui/card'

/** Sección de página con encabezado h2 y región etiquetada (landmark). */
export function PageSection({ title, description, actions, children, className }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={className}>
      <Card className="gap-4">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle>
              <h2 id={headingId} className="text-base font-semibold">
                {title}
              </h2>
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {actions}
        </CardHeader>
        <CardContent className="min-w-0">{children}</CardContent>
      </Card>
    </section>
  )
}
