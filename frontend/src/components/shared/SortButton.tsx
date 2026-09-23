import { ChevronDownIcon, ChevronsUpDownIcon, ChevronUpIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

import type { SortDirection } from '@/components/shared/sort-utils'

/**
 * A column header that sorts (plan.md 8.4): the label with a chevron for the
 * current direction, a double chevron when the column is not the sort key.
 * Every table renders its sortable headers through this, so they all look
 * and behave the same.
 */
export function SortButton({
  direction,
  onClick,
  children,
  className,
}: {
  direction: SortDirection
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // text-transform: buttons reset it, so the label would lose the header's case.
        'inline-flex items-center gap-1 rounded-control [text-transform:inherit] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        direction && 'text-ink',
        className,
      )}
    >
      {children}
      {direction === 'asc' ? (
        <ChevronUpIcon aria-hidden="true" className="size-3.5" />
      ) : direction === 'desc' ? (
        <ChevronDownIcon aria-hidden="true" className="size-3.5" />
      ) : (
        <ChevronsUpDownIcon aria-hidden="true" className="size-3.5 opacity-50" />
      )}
    </button>
  )
}
