import { XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface ClearFiltersButtonProps {
  /** Whether any filter is on; the button only renders then. */
  active: boolean
  onClick: () => void
  className?: string
}

/** The one "Clear filters" control every filtered list shows in its toolbar. */
export function ClearFiltersButton({ active, onClick, className }: ClearFiltersButtonProps) {
  if (!active) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      data-slot="clear-filters"
      className={cn('text-ink-muted', className)}
      onClick={onClick}
    >
      <XIcon data-icon="inline-start" aria-hidden="true" />
      Clear filters
    </Button>
  )
}
