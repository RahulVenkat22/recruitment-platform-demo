import { ChartColumnIcon, TableIcon } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface ChartCardProps {
  title: string
  /** One line under the title saying what the figures cover ("Last 30 days", "Right now"). */
  subtitle?: ReactNode
  /** Right-hand controls: a selector, a "View all" link. */
  action?: ReactNode
  /** The same numbers as a plain table; when given, a toggle lets the reader switch to it. */
  table?: ReactNode
  /** True while a new scope is loading: the previous render stays, dimmed, so nothing jumps. */
  busy?: boolean
  children: ReactNode
  className?: string
  bodyClassName?: string
}

/**
 * A dashboard widget: caption title, optional controls, and a chart that can be
 * flipped to its table twin so every value is reachable without hovering.
 */
export function ChartCard({
  title,
  subtitle,
  action,
  table,
  busy = false,
  children,
  className,
  bodyClassName,
}: ChartCardProps) {
  const headingId = useId()
  const [showTable, setShowTable] = useState(false)

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={busy || undefined}
      data-slot="chart-card"
      className={cn(
        'section-reveal flex min-w-0 flex-col rounded-card border border-line bg-surface p-5 shadow-card',
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="truncate text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase"
          >
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-small text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          {table && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-pressed={showTable}
                  aria-label={showTable ? 'Show as chart' : 'Show as table'}
                  onClick={() => setShowTable((value) => !value)}
                  className="text-ink-subtle hover:text-ink"
                >
                  {showTable ? (
                    <ChartColumnIcon aria-hidden="true" />
                  ) : (
                    <TableIcon aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showTable ? 'Show as chart' : 'Show as table'}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <div
        className={cn(
          'min-w-0 flex-1 transition-opacity duration-150 ease-brand',
          busy && 'opacity-60',
          bodyClassName,
        )}
      >
        <div key={showTable ? 'table' : 'chart'} className="section-reveal">
          {showTable && table ? table : children}
        </div>
      </div>
    </section>
  )
}

/** The plain-table twin of a chart: a caption for screen readers, numbers right-aligned. */
export function DataList({
  columns,
  rows,
  caption,
}: {
  columns: readonly string[]
  rows: readonly (readonly (string | number)[])[]
  caption: string
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-small">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-caption text-ink-subtle">
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={cn('py-1.5 pr-3 font-medium', index > 0 && 'text-right')}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) => (
                <td
                  key={index}
                  className={cn(
                    'py-1.5 pr-3',
                    index === 0 ? 'text-ink' : 'text-right text-ink-muted tabular-nums',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
