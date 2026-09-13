import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

/*
 * Loading placeholders (plan.md 8.4): every block pulses on `surface-3` and
 * keeps the radius of the element it stands in for, so nothing jumps when the
 * real content lands. Each root is `aria-busy` so screenshots and tests can
 * wait on `[aria-busy="true"]`.
 */

const BONE = 'bg-surface-3'

export interface SkeletonTextProps {
  lines?: number
  className?: string
}

/** Paragraph placeholder; the last line is shorter, like real text. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div aria-busy="true" aria-label="Loading" className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          data-testid="skeleton-line"
          className={cn('h-3.5', BONE, index === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}

export interface SkeletonCardProps {
  /** Rows of body text under the title. */
  lines?: number
  /** Leading avatar circle, for people and candidate cards. */
  avatar?: boolean
  className?: string
}

export function SkeletonCard({ lines = 2, avatar = false, className }: SkeletonCardProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading card"
      className={cn('rounded-card border border-line bg-surface p-5 shadow-card', className)}
    >
      <div className="flex items-center gap-3">
        {avatar && <Skeleton className={cn('size-10 shrink-0 rounded-full', BONE)} />}
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className={cn('h-4 w-1/2', BONE)} />
          <Skeleton className={cn('h-3 w-1/3', BONE)} />
        </div>
      </div>
      {lines > 0 && <SkeletonText lines={lines} className="mt-4" />}
    </div>
  )
}

export interface SkeletonTableRowsProps {
  rows?: number
  columns: number
  /** Widths per column as Tailwind width classes; cycles when shorter than `columns`. */
  widths?: string[]
}

const DEFAULT_WIDTHS = ['w-40', 'w-24', 'w-20', 'w-28', 'w-16', 'w-24']

/** Drop inside `<TableBody>` (or a bare `<table>`): renders `rows` shimmer rows. */
export function SkeletonTableRows({
  rows = 8,
  columns,
  widths = DEFAULT_WIDTHS,
}: SkeletonTableRowsProps) {
  return (
    <tbody aria-busy="true" aria-label="Loading rows" data-slot="skeleton-table-rows">
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row} className="hover:bg-transparent">
          {Array.from({ length: columns }, (_, column) => (
            <TableCell key={column} className="h-12">
              {column === 0 ? (
                <div className="flex items-center gap-2.5">
                  <Skeleton className={cn('size-6 shrink-0 rounded-full', BONE)} />
                  <Skeleton className={cn('h-3.5', BONE, widths[column % widths.length])} />
                </div>
              ) : (
                <Skeleton className={cn('h-3.5', BONE, widths[column % widths.length])} />
              )}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </tbody>
  )
}

export interface SkeletonMetricRowProps {
  count?: number
  /** Matches `MetricCard variant="compact"`. */
  compact?: boolean
  className?: string
}

export function SkeletonMetricRow({
  count = 8,
  compact = false,
  className,
}: SkeletonMetricRowProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading metrics"
      data-compact={compact || undefined}
      className={cn(
        'grid gap-3',
        compact
          ? 'grid-cols-[repeat(auto-fit,minmax(132px,1fr))]'
          : 'grid-cols-2 md:grid-cols-4 2xl:grid-cols-8',
        className,
      )}
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          data-testid="skeleton-metric"
          className={cn(
            'rounded-card border border-line bg-surface shadow-card',
            compact ? 'space-y-2 px-4 py-3' : 'space-y-3 p-5',
          )}
        >
          {!compact && <Skeleton className={cn('size-8 rounded-full', BONE)} />}
          <Skeleton className={cn('h-3 w-20', BONE)} />
          <Skeleton className={cn(compact ? 'h-6 w-12' : 'h-8 w-16', BONE)} />
        </div>
      ))}
    </div>
  )
}

export interface SkeletonTimelineProps {
  items?: number
  className?: string
}

export function SkeletonTimeline({ items = 6, className }: SkeletonTimelineProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading timeline"
      className={cn('relative space-y-6 pl-8', className)}
    >
      <span aria-hidden="true" className="absolute top-1 bottom-1 left-4 w-px bg-line" />
      {Array.from({ length: items }, (_, index) => (
        <div key={index} data-testid="skeleton-timeline-item" className="relative">
          <Skeleton
            className={cn(
              'absolute top-1 -left-[26px] size-3 rounded-full ring-2 ring-surface',
              BONE,
            )}
          />
          <div className="flex items-center gap-2">
            <Skeleton className={cn('h-3 w-14', BONE)} />
            <Skeleton className={cn('size-5 rounded-full', BONE)} />
            <Skeleton className={cn('h-3.5', BONE, index % 2 === 0 ? 'w-64' : 'w-48')} />
          </div>
          {index % 3 === 1 && <Skeleton className={cn('mt-2 h-3 w-80 max-w-full', BONE)} />}
        </div>
      ))}
    </div>
  )
}
