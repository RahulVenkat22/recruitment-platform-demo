import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface TooltipRow {
  label: string
  value: ReactNode
  /** Series colour drawn as a short line key beside the label. */
  color?: string
  muted?: boolean
}

/**
 * The hover readout shared by every chart: a title, then one row per series with
 * the value leading (the reader already knows the series, they want the number).
 */
export function ChartTooltip({
  title,
  rows,
  footer,
}: {
  title: ReactNode
  rows: readonly TooltipRow[]
  footer?: ReactNode
}) {
  return (
    <div
      role="presentation"
      className="min-w-40 rounded-control border border-line bg-surface px-3 py-2 text-small shadow-card-hover"
    >
      <p className="font-medium text-ink">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 items-center gap-2">
              {row.color && (
                <span
                  aria-hidden="true"
                  className="inline-block h-0.5 w-3 shrink-0 rounded-full"
                  style={{ background: row.color }}
                />
              )}
              <span className={cn('truncate', row.muted ? 'text-ink-subtle' : 'text-ink-muted')}>
                {row.label}
              </span>
            </span>
            <span className="shrink-0 font-medium text-ink tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
      {footer && <p className="mt-1.5 text-caption text-ink-subtle">{footer}</p>}
    </div>
  )
}
