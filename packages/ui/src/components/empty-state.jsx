import { Inbox } from 'lucide-react'
import { cn } from '@astronaut-wellness/ui/lib/utils'

/** Estado vacío informativo: no hay datos (todavía), sin que sea un error. */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className, ...props }) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center',
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
