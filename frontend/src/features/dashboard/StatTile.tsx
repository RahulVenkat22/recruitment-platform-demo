import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, type LucideIcon } from 'lucide-react'
import { Area, AreaChart } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { SPARK } from '@/features/dashboard/charts/theme'
import { deltaTone, formatDelta, type DeltaTone } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import type { DashboardMetric } from '@/types/domain'

export interface StatTileProps {
  label: string
  metric?: DashboardMetric
  icon: LucideIcon
  /** Opens the records behind the number, in place. */
  onClick: () => void
  /** True while this tile's records are open. */
  active?: boolean
  /** Whether a rise is welcome: more hires yes, more days to hire no. */
  goodDirection?: 'up' | 'down'
  rangeDays: number
  loading?: boolean
}

const TONE: Record<DeltaTone, string> = {
  good: 'bg-success-soft text-success',
  bad: 'bg-danger-soft text-danger',
  flat: 'bg-surface-2 text-ink-muted',
}

function Sparkline({ series }: { series: readonly number[] }) {
  const reduced = useMotionPreference()
  const data = series.map((value, index) => ({ index, value }))
  const flat = series.every((value) => value === 0)
  return (
    <AreaChart
      width={88}
      height={32}
      data={data}
      margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
      aria-hidden="true"
    >
      <Area
        type="monotone"
        dataKey="value"
        stroke={flat ? '#b7b7ae' : SPARK}
        strokeWidth={1.5}
        fill={SPARK}
        fillOpacity={flat ? 0 : 0.12}
        isAnimationActive={!reduced}
        animationDuration={900}
        dot={false}
        activeDot={false}
      />
    </AreaChart>
  )
}

/**
 * A headline figure (plan.md 9.3 metric card, redrawn): icon and label, the
 * value in proportional figures, a delta chip when the figure is a flow, a
 * sparkline of its daily series, and one short qualifier. The tile is a button
 * that opens the records behind the number in the dashboard's drawer.
 */
export function StatTile({
  label,
  metric,
  icon: Icon,
  onClick,
  active = false,
  goodDirection = 'up',
  rangeDays,
  loading = false,
}: StatTileProps) {
  const delta = metric?.delta ?? null
  const chip = delta === null ? null : TONE[deltaTone(delta, goodDirection)]
  const Arrow =
    delta === null || delta === 0 ? MinusIcon : delta > 0 ? ArrowUpRightIcon : ArrowDownRightIcon

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid="stat-tile"
      aria-busy={loading || undefined}
      className={cn(
        'group/tile flex min-w-0 flex-col rounded-card border bg-surface p-4 text-left shadow-card',
        'transition-[box-shadow,transform,border-color] duration-150 ease-brand hover:-translate-y-px hover:shadow-card-hover',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        active ? 'border-ink' : 'border-line',
      )}
    >
      <span className="flex items-center gap-2 text-caption tracking-[0.04em] text-ink-muted uppercase">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-ink-subtle" strokeWidth={1.75} />
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-2 flex items-end justify-between gap-2">
        {loading || !metric ? (
          <Skeleton className="h-8 w-20 bg-surface-3" />
        ) : (
          <span className="font-heading text-[28px] leading-8 font-semibold tracking-[-0.02em] text-ink">
            {metric.value === null ? (
              '—'
            ) : (
              <AnimatedNumber
                value={metric.value}
                decimals={metric.unit === 'count' ? 0 : 1}
                suffix={metric.unit === 'percent' ? '%' : metric.unit === 'days' ? 'd' : ''}
              />
            )}
          </span>
        )}
        {metric?.series && metric.series.length > 1 && (
          <span className="-mr-1 shrink-0 text-ink-subtle">
            <Sparkline series={metric.series} />
          </span>
        )}
      </span>
      <span className="mt-2 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-subtle">
        {metric && delta !== null && chip && (
          <span
            data-testid="stat-delta"
            className={cn(
              'inline-flex h-5 items-center gap-0.5 rounded-pill pr-1.5 pl-1 font-medium tabular-nums',
              chip,
            )}
          >
            <Arrow aria-hidden="true" className="size-3" />
            {formatDelta(delta, metric.unit)}
          </span>
        )}
        {metric && delta !== null && <span>vs previous {rangeDays} days</span>}
        {metric?.detail && (delta === null || !metric.series) && (
          <span className={cn(delta !== null && 'basis-full')}>{metric.detail}</span>
        )}
      </span>
    </button>
  )
}
