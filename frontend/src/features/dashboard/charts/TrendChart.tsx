import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { ChartTooltip } from '@/features/dashboard/charts/ChartTooltip'
import { CHART_INK } from '@/features/dashboard/charts/theme'
import { TREND_SERIES, type TrendKey } from '@/features/dashboard/charts/trend-series'
import {
  axisTicks,
  cumulative,
  formatAxisDay,
  formatPointDate,
} from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import type { TrendPoint } from '@/types/domain'

type Mode = 'daily' | 'cumulative'

const MODES = [
  { key: 'daily', label: 'Daily' },
  { key: 'cumulative', label: 'Cumulative' },
] as const

interface TooltipProps {
  active?: boolean
  label?: string
  payload?: { dataKey?: string | number; value?: number | string; color?: string }[]
}

function TrendTooltip({ active, label, payload }: TooltipProps) {
  if (!active || !payload?.length || !label) return null
  const byKey = new Map(payload.map((entry) => [String(entry.dataKey), entry]))
  return (
    <ChartTooltip
      title={formatPointDate(label)}
      rows={TREND_SERIES.filter((series) => byKey.has(series.key)).map((series) => ({
        label: series.label,
        value: Number(byKey.get(series.key)?.value ?? 0),
        color: series.color,
      }))}
    />
  )
}

/**
 * Hiring activity across the window: one line per flow. The legend toggles
 * series, the readout lists every series at the hovered day, and the
 * cumulative view shows how the window added up.
 */
export function TrendChart({
  points,
  className,
}: {
  points: readonly TrendPoint[]
  className?: string
}) {
  const [hidden, setHidden] = useState<Set<TrendKey>>(() => new Set())
  const [mode, setMode] = useState<Mode>('daily')

  const data = useMemo(() => {
    if (mode === 'daily') return [...points]
    const totals = Object.fromEntries(
      TREND_SERIES.map((series) => [series.key, cumulative(points.map((p) => p[series.key]))]),
    ) as Record<TrendKey, number[]>
    return points.map((point, index) => ({
      ...point,
      ...Object.fromEntries(TREND_SERIES.map((s) => [s.key, totals[s.key][index]])),
    }))
  }, [points, mode])

  const dates = points.map((point) => point.date)
  const ticks = axisTicks(dates)
  const quiet = points.every((point) => TREND_SERIES.every((series) => point[series.key] === 0))

  function toggle(key: TrendKey) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else if (next.size < TREND_SERIES.length - 1) next.add(key)
      return next
    })
  }

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex flex-wrap gap-x-1 gap-y-1" aria-label="Series">
          {TREND_SERIES.map((series) => {
            const off = hidden.has(series.key)
            return (
              <li key={series.key}>
                <button
                  type="button"
                  aria-pressed={!off}
                  onClick={() => toggle(series.key)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-control px-2 text-small transition-colors duration-150 ease-brand hover:bg-surface-2',
                    off ? 'text-ink-subtle line-through decoration-line-strong' : 'text-ink-muted',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="inline-block h-0.5 w-3.5 rounded-full"
                    style={{ background: off ? '#b7b7ae' : series.color }}
                  />
                  {series.label}
                </button>
              </li>
            )
          })}
        </ul>
        <SegmentedControl
          size="sm"
          aria-label="Trend view"
          options={MODES}
          value={mode}
          onChange={setMode}
          className="w-auto"
        />
      </div>
      <div className="relative h-64 w-full" role="img" aria-label="Hiring activity by day">
        {quiet && (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-small text-ink-subtle">
            No activity in this window.
          </p>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 28, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART_INK.grid} strokeWidth={1} />
            <XAxis
              dataKey="date"
              ticks={ticks}
              tickFormatter={formatAxisDay}
              tick={{ fill: CHART_INK.axis, fontSize: 11 }}
              axisLine={{ stroke: CHART_INK.baseline }}
              tickLine={false}
              tickMargin={8}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              width={32}
              tick={{ fill: CHART_INK.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<TrendTooltip />}
              cursor={{ stroke: CHART_INK.baseline, strokeWidth: 1 }}
              isAnimationActive={false}
            />
            {TREND_SERIES.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                name={series.label}
                hide={hidden.has(series.key)}
                stroke={series.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_INK.surface, fill: series.color }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
