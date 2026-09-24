import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts'
import { SERIES } from '@/features/dashboard/charts/theme'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import type { KeyCount } from '@/types/domain'

/**
 * Candidates by the source that surfaced them: a donut with the total in the
 * middle (the hovered source while pointing), and a legend that doubles as the
 * direct labels. Clicking a slice or a legend row opens those candidates in place.
 */
export function SourceDonut({
  sources,
  onSelect,
  className,
}: {
  sources: readonly KeyCount[]
  onSelect: (source: KeyCount) => void
  className?: string
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = sources.reduce((sum, source) => sum + source.value, 0)
  const rows = sources.map((source, index) => ({ ...source, color: SERIES[index % SERIES.length] }))
  const shown = rows.find((row) => row.key === hovered)
  const percent = (value: number) => (total ? `${Math.round((value / total) * 100)}%` : '—')

  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-4', className)}>
      <div
        className="relative size-40 shrink-0 [&_.recharts-sector]:cursor-pointer"
        role="img"
        aria-label={`Candidates by source: ${rows.map((r) => `${r.label} ${r.value}`).join(', ')}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={rows.filter((row) => row.value > 0)}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={rows.filter((row) => row.value > 0).length > 1 ? 2 : 0}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
              onMouseEnter={(_data, index) =>
                setHovered(rows.filter((r) => r.value > 0)[index]?.key ?? null)
              }
              onMouseLeave={() => setHovered(null)}
              onClick={(_data, index) => {
                const row = rows.filter((r) => r.value > 0)[index]
                if (row) onSelect(row)
              }}
            >
              {rows
                .filter((row) => row.value > 0)
                .map((row) => (
                  <Cell
                    key={row.key}
                    fill={row.color}
                    fillOpacity={hovered === null || hovered === row.key ? 1 : 0.45}
                  />
                ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-heading text-[22px] leading-7 font-semibold text-ink">
            {shown ? formatCount(shown.value) : formatCount(total)}
          </span>
          <span className="max-w-24 truncate text-caption text-ink-subtle">
            {shown ? shown.label : 'candidates'}
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1" aria-label="Sources">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onMouseEnter={() => setHovered(row.key)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(row.key)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect(row)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left text-small transition-colors duration-150 ease-brand hover:bg-surface-2',
                hovered === row.key && 'bg-surface-2',
              )}
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ background: row.color }}
              />
              <span className="min-w-0 flex-1 truncate text-ink">{row.label}</span>
              <span className="shrink-0 text-ink-subtle tabular-nums">{percent(row.value)}</span>
              <span className="w-10 shrink-0 text-right font-medium text-ink tabular-nums">
                {formatCount(row.value)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
