import { completionTone } from '@/features/home/home-utils'
import { cn } from '@/lib/utils'

export interface CompletionMeterProps {
  value: number
  className?: string
}

const FILL: Record<ReturnType<typeof completionTone>, string> = {
  done: 'bg-success',
  progress: 'bg-accent-strong',
  idle: 'bg-line-strong',
}

/** The "% Completed" cell (Enhancement.md 3): a slim bar plus the number in tabular figures. */
export function CompletionMeter({ value, className }: CompletionMeterProps) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div
      data-slot="completion-meter"
      className={cn('flex min-w-28 items-center gap-2.5', className)}
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${pct}% completed`}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-3"
      >
        <div
          className={cn(
            'h-full rounded-pill transition-[width] duration-400 ease-brand',
            FILL[completionTone(pct)],
          )}
          style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-small font-medium text-ink tabular-nums">
        {pct}%
      </span>
    </div>
  )
}
