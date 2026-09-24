import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { motion } from 'motion/react'
import { matchTone, type MatchTone } from '@/components/shared/match-tone'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: { px: 32, stroke: 3, text: 'text-[10px]' },
  md: { px: 48, stroke: 4, text: 'text-[13px]' },
  lg: { px: 72, stroke: 5, text: 'text-[18px]' },
} as const

const TONE_CLASSES: Record<MatchTone, string> = {
  emerald: 'stroke-success',
  amber: 'stroke-warning',
  slate: 'stroke-line-strong',
}

export interface MatchRingProps {
  /** 0 to 100; anything outside is clamped. */
  value: number
  size?: keyof typeof SIZES
  showLabel?: boolean
  className?: string
}

/** SVG ring for a match percentage; the arc sweeps in from zero on first render. */
export function MatchRing({ value, size = 'md', showLabel = true, className }: MatchRingProps) {
  const reducedMotion = useMotionPreference()
  const pct = Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)))
  const tone = matchTone(pct)
  const { px, stroke, text } = SIZES[size]
  const radius = (px - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - pct / 100)
  const label = `${pct}% match`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          data-slot="match-ring"
          data-tone={tone}
          style={{ width: px, height: px }}
          className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
        >
          <svg
            width={px}
            height={px}
            viewBox={`0 0 ${px} ${px}`}
            aria-hidden="true"
            className="-rotate-90"
          >
            <circle
              cx={px / 2}
              cy={px / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              className="stroke-surface-3"
            />
            <motion.circle
              cx={px / 2}
              cy={px / 2}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={reducedMotion ? false : { strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: reducedMotion ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
              className={TONE_CLASSES[tone]}
            />
          </svg>
          {showLabel && (
            <span
              aria-hidden="true"
              className={cn(
                'absolute inset-0 flex items-center justify-center font-medium text-ink tabular-nums',
                text,
              )}
            >
              {pct}
            </span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}
