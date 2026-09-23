import { useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartTooltip } from '@/features/dashboard/charts/ChartTooltip'
import { CHART_INK, STAGE_COLORS } from '@/features/dashboard/charts/theme'
import type { FunnelStage } from '@/types/domain'

export interface FunnelChartProps {
  stages: readonly FunnelStage[]
  /** Where a click on a stage goes (the candidates list narrowed to that stage). */
  hrefFor?: (stage: FunnelStage) => string | null
  className?: string
}

interface Row extends FunnelStage {
  fill: string
}

function StageTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <ChartTooltip
      title={row.label}
      rows={[
        { label: row.value === 1 ? 'candidate' : 'candidates', value: row.value, color: row.fill },
        ...(row.conversion_pct === null
          ? []
          : [{ label: 'of the previous stage', value: `${row.conversion_pct}%` }]),
      ]}
    />
  )
}

function ValueLabel(props: {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  index?: number
  rows: Row[]
}) {
  const { rows, index = 0 } = props
  const x = Number(props.x) + Number(props.width) + 8
  const y = Number(props.y) + Number(props.height) / 2
  const row = rows[index]
  if (!row) return null
  return (
    <text x={x} y={y} dominantBaseline="middle" className="fill-ink text-[12px] tabular-nums">
      <tspan className="font-medium">{row.value}</tspan>
      {row.conversion_pct !== null && (
        <tspan dx={6} className="fill-ink-subtle">
          {row.conversion_pct}%
        </tspan>
      )}
    </text>
  )
}

/**
 * Horizontal funnel (plan.md 8.4): thin bars on a one-hue ramp darkening with the
 * stage, direct value and conversion labels, a hover readout, and a click that
 * opens the candidates behind a stage.
 */
export function FunnelChart({ stages, hrefFor, className }: FunnelChartProps) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState<number | null>(null)
  const rows: Row[] = stages.map((stage) => ({
    ...stage,
    fill: STAGE_COLORS[stage.key] ?? STAGE_COLORS.onboarded,
  }))
  const max = Math.max(1, ...rows.map((row) => row.value))
  const clickable = Boolean(hrefFor)

  return (
    <div className={className} data-slot="funnel-chart" role="img" aria-label="Recruitment funnel">
      <ResponsiveContainer width="100%" height={stages.length * 40 + 8}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
          barCategoryGap={10}
          onMouseLeave={() => setHovered(null)}
        >
          <XAxis type="number" hide domain={[0, max]} />
          <YAxis
            type="category"
            dataKey="label"
            width={92}
            axisLine={false}
            tickLine={false}
            tick={{ fill: CHART_INK.axis, fontSize: 13 }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(10, 10, 10, 0.04)' }}
            content={<StageTooltip />}
            isAnimationActive={false}
          />
          <Bar
            dataKey="value"
            barSize={16}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
            cursor={clickable ? 'pointer' : undefined}
            onMouseEnter={(_data, index) => setHovered(index)}
            onClick={(_data, index) => {
              const href = hrefFor?.(rows[index])
              if (href) void navigate(href)
            }}
          >
            {rows.map((row, index) => (
              <Cell
                key={row.key}
                fill={row.fill}
                fillOpacity={hovered === null || hovered === index ? 1 : 0.55}
              />
            ))}
            <LabelList
              dataKey="value"
              content={(props) => <ValueLabel {...(props as object)} rows={rows} />}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
