import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { motion } from 'motion/react'
import { matchTone, type MatchTone } from '@/components/shared/match-tone'
import { cn } from '@/lib/utils'

export interface MatchBarProps {
  label: string
  /** 0 to 100; clamped. */
  value: number
  /** Weight of this component in the overall score, as a percentage. */
  weight?: number
  className?: string
}

const FILL: Record<MatchTone, string> = {
  emerald: 'bg-success',
  amber: 'bg-warning',
  slate: 'bg-line-strong',
}

/** One row of the AI Match Analysis breakdown: label left, value right, 6px track. */
export function MatchBar({ label, value, weight, className }: MatchBarProps) {
  const reducedMotion = useMotionPreference()
  const pct = Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)))
  const tone = matchTone(pct)

  return (
    <div data-slot="match-bar" className={cn('min-w-0', className)}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="truncate text-small font-medium text-ink">{label}</span>
        <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
          {weight !== undefined && (
            <span className="text-caption text-ink-subtle">Weight {weight}%</span>
          )}
          <span className="text-small font-medium text-ink">{pct}%</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        data-tone={tone}
        className="h-1.5 w-full overflow-hidden rounded-pill bg-surface-3"
      >
        <motion.div
          className={cn('h-full rounded-pill', FILL[tone])}
          initial={reducedMotion ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: reducedMotion ? 0 : 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  )
}
