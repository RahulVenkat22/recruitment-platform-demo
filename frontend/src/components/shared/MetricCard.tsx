import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface MetricCardProps {
  label: string
  /** Numbers get locale grouping ("12,840"); strings render as given ("₹18L"). */
  value: number | string
  /** Change against the previous period; sign decides the colour. */
  delta?: number | null
  deltaLabel?: string
  icon?: LucideIcon
  /** Makes the whole card a link to the filtered list behind the number. */
  to?: string
  loading?: boolean
  /** `compact` is the JD detail metric row (plan.md 9.6): no icon circle, smaller number. */
  variant?: 'default' | 'compact'
  className?: string
}

const numberFormat = new Intl.NumberFormat('en-IN')

type DeltaDirection = 'up' | 'down' | 'flat'

function deltaDirection(delta: number): DeltaDirection {
  if (delta > 0) return 'up'
  if (delta < 0) return 'down'
  return 'flat'
}

const DELTA_STYLES: Record<DeltaDirection, { chip: string; Icon: LucideIcon; sign: string }> = {
  up: { chip: 'bg-success-soft text-success', Icon: ArrowUpRightIcon, sign: '+' },
  down: { chip: 'bg-danger-soft text-danger', Icon: ArrowDownRightIcon, sign: '' },
  flat: { chip: 'bg-surface-2 text-ink-muted', Icon: MinusIcon, sign: '' },
}

function DeltaChip({ delta, label }: { delta: number; label: string }) {
  const direction = deltaDirection(delta)
  const { chip, Icon, sign } = DELTA_STYLES[direction]
  return (
    <div className="flex items-center gap-1.5 text-caption text-ink-subtle">
      <span
        data-testid="metric-delta"
        data-direction={direction}
        className={cn(
          'inline-flex h-5 items-center gap-0.5 rounded-pill pr-1.5 pl-1 font-medium tabular-nums',
          chip,
        )}
      >
        <Icon aria-hidden="true" className="size-3" />
        {sign}
        {numberFormat.format(delta)}
      </span>
      <span>{label}</span>
    </div>
  )
}

/**
 * Dashboard and JD metric tile (plan.md 8.4): icon in a 32px soft circle, caption
 * label, metric number in tabular numerals, delta chip. Hover lifts only when the
 * card is a link, since that is the only case where it does anything.
 */
export function MetricCard({
  label,
  value,
  delta,
  deltaLabel = 'vs last 7 days',
  icon: Icon,
  to,
  loading = false,
  variant = 'default',
  className,
}: MetricCardProps) {
  const compact = variant === 'compact'
  const shownValue = typeof value === 'number' ? numberFormat.format(value) : value
  const hasDelta = delta !== undefined && delta !== null

  const body: ReactNode = (
    <>
      {Icon && !compact && (
        <span
          data-testid="metric-icon"
          aria-hidden="true"
          className="mb-3 inline-flex size-8 items-center justify-center rounded-full bg-primary-soft text-primary [&_svg]:size-4"
        >
          <Icon strokeWidth={1.75} />
        </span>
      )}
      <span
        className={cn(
          'block text-caption tracking-[0.04em] text-ink-muted uppercase',
          compact ? 'truncate' : '',
        )}
      >
        {label}
      </span>
      {loading ? (
        <Skeleton className={cn('mt-1.5 bg-surface-3', compact ? 'h-6 w-12' : 'h-8 w-20')} />
      ) : (
        <span
          className={cn(
            'mt-0.5 block text-ink tabular-nums',
            compact ? 'text-[22px] leading-7 font-medium tracking-[-0.02em]' : 'text-metric',
          )}
        >
          {shownValue}
        </span>
      )}
      {hasDelta && !loading && (
        <div className={cn(compact ? 'mt-1' : 'mt-2')}>
          <DeltaChip delta={delta} label={deltaLabel} />
        </div>
      )}
    </>
  )

  const classes = cn(
    'group/metric block min-w-0 rounded-card border border-line bg-surface text-left shadow-card',
    compact ? 'px-4 py-3' : 'p-5',
    to &&
      'transition-[box-shadow,transform] duration-150 ease-brand hover:-translate-y-px hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
    className,
  )

  const shared = {
    'data-testid': 'metric-card',
    'data-variant': variant,
    'aria-busy': loading || undefined,
  }

  if (to) {
    return (
      <Link to={to} className={classes} {...shared}>
        {body}
      </Link>
    )
  }
  return (
    <div className={classes} {...shared}>
      {body}
    </div>
  )
}
