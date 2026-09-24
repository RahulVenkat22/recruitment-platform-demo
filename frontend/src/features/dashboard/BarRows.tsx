import { formatCount } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'

export interface BarRow {
  key: string
  label: string
  value: number
  color: string
  /** One short qualifier on the right, e.g. "3 roles ask". */
  hint?: string
  tone?: 'warning'
}

export interface BarRowsProps {
  rows: readonly BarRow[]
  /** The value that fills the whole track; defaults to the largest row. */
  max?: number
  onSelect?: (row: BarRow) => void
  'aria-label': string
  className?: string
}

/**
 * One thin bar per row with the label and value above it: the dashboard's
 * plain ranked list. Rows are buttons when a click opens the records behind them.
 */
export function BarRows({ rows, max, onSelect, 'aria-label': ariaLabel, className }: BarRowsProps) {
  const scale = Math.max(1, max ?? Math.max(...rows.map((row) => row.value)))
  return (
    <ul className={cn('space-y-1', className)} aria-label={ariaLabel}>
      {rows.map((row) => {
        const body = (
          <>
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-small text-ink">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: row.color }}
                />
                <span className="truncate">{row.label}</span>
              </span>
              <span className="shrink-0 text-caption tabular-nums">
                {row.hint && (
                  <span
                    className={cn(
                      'mr-2',
                      row.tone === 'warning' ? 'text-warning' : 'text-ink-subtle',
                    )}
                  >
                    {row.hint}
                  </span>
                )}
                <span className="font-medium text-ink">{formatCount(row.value)}</span>
              </span>
            </span>
            <span className="mt-1 block h-1.5 w-full rounded-pill bg-surface-2">
              <span
                className="block h-full rounded-pill"
                style={{ width: `${(row.value / scale) * 100}%`, background: row.color }}
              />
            </span>
          </>
        )
        const classes = '-mx-2 block w-[calc(100%+1rem)] rounded-control px-2 py-1.5 text-left'
        return (
          <li key={row.key}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(row)}
                className={cn(
                  classes,
                  'transition-colors duration-150 ease-brand hover:bg-surface-2',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                )}
              >
                {body}
              </button>
            ) : (
              <div className={classes}>{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
