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
import type { FunnelStage } from '@/types/domain'

/** One brand hue, dark to light, in stage order (plan.md 8.4 FunnelChart, sequential ramp). */
/** Buro Happold ramp: black at the top of the funnel through the lime at the bottom. */
const RAMP = ['#0a0a0a', '#3d4400', '#6b7500', '#8fa000', '#b3c400', '#c4d600']

export interface FunnelChartProps {
  stages: readonly FunnelStage[]
  className?: string
}

interface Row extends FunnelStage {
  fill: string
}

function StageTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-control border border-line bg-surface px-3 py-2 text-small shadow-card-hover">
      <p className="font-medium text-ink">{row.label}</p>
      <p className="text-ink-muted tabular-nums">
        {row.value} {row.value === 1 ? 'candidate' : 'candidates'}
        {row.conversion_pct !== null && ` · ${row.conversion_pct}% of the previous stage`}
      </p>
    </div>
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

/** Horizontal funnel: thin bars, rounded data ends, direct value labels, hover tooltip. */
export function FunnelChart({ stages, className }: FunnelChartProps) {
  const rows: Row[] = stages.map((stage, index) => ({
    ...stage,
    fill: RAMP[index] ?? RAMP[RAMP.length - 1],
  }))
  const max = Math.max(1, ...rows.map((row) => row.value))
  return (
    <div className={className} data-slot="funnel-chart" role="img" aria-label="Recruitment funnel">
      <ResponsiveContainer width="100%" height={stages.length * 40 + 8}>
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
          barCategoryGap={10}
        >
          <XAxis type="number" hide domain={[0, max]} />
          <YAxis
            type="category"
            dataKey="label"
            width={92}
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#4a4d48', fontSize: 13 }}
          />
          <Tooltip cursor={{ fill: 'rgba(14, 16, 19, 0.04)' }} content={<StageTooltip />} />
          <Bar dataKey="value" barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
            {rows.map((row) => (
              <Cell key={row.key} fill={row.fill} />
            ))}
            <LabelList
              dataKey="value"
              content={(props) => <ValueLabel {...(props as object)} rows={rows} />}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>Recruitment funnel</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
              <td>{row.conversion_pct === null ? '' : `${row.conversion_pct}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
