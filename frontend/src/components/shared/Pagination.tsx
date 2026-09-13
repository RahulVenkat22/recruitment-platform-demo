import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import {
  pageCountFor,
  pageWindow,
  type PaginationState,
} from '@/components/shared/pagination-utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PAGE_SIZES } from '@/lib/ui-store'
import { cn } from '@/lib/utils'

export interface PaginationProps extends PaginationState {
  total: number
  onChange: (state: PaginationState) => void
  /** Show the "N per page" select (plan.md 9.4); a size change goes back to the first page. */
  pageSizeOptions?: readonly number[] | false
  className?: string
}

/** "1–20 of 127  ‹ 1 2 3 ›  20 per page" footer shared by tables and card grids. */
export function Pagination({
  pageIndex,
  pageSize,
  total,
  onChange,
  pageSizeOptions = PAGE_SIZES,
  className,
}: PaginationProps) {
  const pageCount = pageCountFor(total, pageSize)
  const current = Math.min(Math.max(0, pageIndex), pageCount - 1) + 1
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1
  const to = Math.min(total, current * pageSize)

  const go = (page: number) => onChange({ pageIndex: page - 1, pageSize })

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-small text-ink-muted',
        className,
      )}
    >
      <span className="tabular-nums">
        {total === 0 ? 'No results' : `${from}–${to} of ${total.toLocaleString('en-IN')}`}
      </span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous page"
          disabled={current <= 1}
          onClick={() => go(current - 1)}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        {pageWindow(current, pageCount).map((entry, index) =>
          entry === null ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-ink-subtle">
              …
            </span>
          ) : (
            <Button
              key={entry}
              type="button"
              variant={entry === current ? 'secondary' : 'ghost'}
              size="sm"
              aria-current={entry === current ? 'page' : undefined}
              aria-label={`Page ${entry}`}
              className={cn('min-w-7 px-2 tabular-nums', entry === current && 'text-ink')}
              onClick={() => go(entry)}
            >
              {entry}
            </Button>
          ),
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Next page"
          disabled={current >= pageCount}
          onClick={() => go(current + 1)}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
      {pageSizeOptions && (
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onChange({ pageIndex: 0, pageSize: Number(value) })}
        >
          <SelectTrigger size="sm" aria-label="Rows per page" className="w-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </nav>
  )
}
