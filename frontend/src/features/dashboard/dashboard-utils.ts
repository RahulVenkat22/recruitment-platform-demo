import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { RangeDays } from '@/features/dashboard/api'
import { param } from '@/lib/hooks'
import type { DashboardMetric } from '@/types/domain'

// ------------------------------------------------------------------ URL state

export type RangeKey = '7' | '30' | '90'

export const RANGE_OPTIONS: readonly { key: RangeKey; label: string }[] = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
]

export const RANGE_KEYS = RANGE_OPTIONS.map((option) => option.key)

/** The dashboard's controls live in the URL so a view can be shared (plan.md 7.1). */
export const DASHBOARD_SPEC = {
  range: param.enum<RangeKey>('30', RANGE_KEYS),
  /** A custom window as ISO dates, both or neither; it wins over `range`. */
  start: param.string(''),
  end: param.string(''),
  /** The people whose job descriptions the dashboard is narrowed to; empty means everyone. */
  user: param.list<string>(),
  /** The job description the funnel is narrowed to; empty means all of them. */
  jd: param.string(''),
}

export function rangeDays(key: RangeKey): RangeDays {
  return Number(key) as RangeDays
}

/** The API's ceiling for a custom window. */
export const MAX_CUSTOM_DAYS = 366

/** Days in an inclusive ISO date range; nonsense (end before start) comes out zero or less. */
export function rangeSpan(start: string, end: string): number {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1
}

/** Both dates given, in order and within the ceiling: what the API accepts. */
export function validCustomRange(start: string, end: string): boolean {
  if (!start || !end) return false
  const span = rangeSpan(start, end)
  return span >= 1 && span <= MAX_CUSTOM_DAYS
}

/** "12 Aug – 22 Sep 2026", shortened to "3 – 9 Sep 2026" inside one month. */
export function formatDateRange(start: string, end: string): string {
  const from = parseISO(start)
  const to = parseISO(end)
  const sameYear = from.getFullYear() === to.getFullYear()
  const sameMonth = sameYear && from.getMonth() === to.getMonth()
  const left = format(from, sameMonth ? 'd' : sameYear ? 'd MMM' : 'd MMM yyyy')
  return `${left} – ${format(to, 'd MMM yyyy')}`
}

// ------------------------------------------------------------------ links

/** The candidates list narrowed to these statuses (and one job description when given). */
export function candidatesHref(filters: {
  statuses?: readonly string[]
  source?: string
  jd?: string
}): string {
  const search = new URLSearchParams()
  if (filters.statuses?.length) search.set('status', filters.statuses.join(','))
  if (filters.source) search.set('source', filters.source)
  if (filters.jd) search.set('jd', filters.jd)
  const query = search.toString()
  return query ? `/candidates?${query}` : '/candidates'
}

// ------------------------------------------------------------------ numbers

const grouped = new Intl.NumberFormat('en-IN')
const oneDecimal = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })

export function formatCount(value: number): string {
  return grouped.format(value)
}

/** "1,284", "62%", "18.5 days"; an em dash when there is no data yet. */
export function formatMetricValue(metric: Pick<DashboardMetric, 'value' | 'unit'>): string {
  if (metric.value === null) return '—'
  if (metric.unit === 'percent') return `${oneDecimal.format(metric.value)}%`
  if (metric.unit === 'days') return `${oneDecimal.format(metric.value)}d`
  return grouped.format(metric.value)
}

/** Signed change: "+12", "-3.5 pp", "+2.1d". */
export function formatDelta(delta: number, unit: DashboardMetric['unit']): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  const magnitude = oneDecimal.format(Math.abs(delta))
  if (unit === 'percent') return `${sign}${magnitude} pp`
  if (unit === 'days') return `${sign}${magnitude}d`
  return `${sign}${magnitude}`
}

export type DeltaTone = 'good' | 'bad' | 'flat'

/** Whether a change is welcome depends on the figure: fewer days to hire is good. */
export function deltaTone(delta: number, goodDirection: 'up' | 'down'): DeltaTone {
  if (delta === 0) return 'flat'
  const up = delta > 0
  return up === (goodDirection === 'up') ? 'good' : 'bad'
}

// ------------------------------------------------------------------ dates

/** "12 Sep" for an ISO date; "Sep" alone on the first of the month so long axes stay sparse. */
export function formatAxisDay(iso: string): string {
  return format(parseISO(iso), 'd MMM')
}

export function formatPointDate(iso: string): string {
  return format(parseISO(iso), 'EEE, d MMM yyyy')
}

/** Which points get an axis tick: about six evenly spaced labels, always including the last day. */
export function axisTicks(dates: readonly string[], target = 6): string[] {
  if (dates.length <= target) return [...dates]
  const step = Math.ceil(dates.length / target)
  const ticks: string[] = []
  for (let index = dates.length - 1; index >= 0; index -= step) ticks.unshift(dates[index])
  return ticks
}

/** Running totals of a daily series, for the trend chart's cumulative view. */
export function cumulative(values: readonly number[]): number[] {
  let total = 0
  return values.map((value) => (total += value))
}

// ------------------------------------------------------------------ heatmap

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/** The busiest hour of the week, for the caption. */
export function peakCell(heatmap: readonly (readonly number[])[]): {
  day: number
  hour: number
  value: number
} | null {
  let best: { day: number; hour: number; value: number } | null = null
  heatmap.forEach((row, day) =>
    row.forEach((value, hour) => {
      if (value > (best?.value ?? 0)) best = { day, hour, value }
    }),
  )
  return best
}
