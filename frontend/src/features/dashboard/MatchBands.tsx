import { BarRows } from '@/features/dashboard/BarRows'
import { ORDINAL_RAMP } from '@/features/dashboard/charts/theme'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import type { KeyCount, MatchInsight } from '@/types/domain'

/** How well the pipeline fits its roles: the scored candidates in four bands, weakest first. */
export function MatchBands({
  match,
  onSelect,
}: {
  match: MatchInsight
  onSelect: (band: KeyCount) => void
}) {
  const rows = match.bands.map((band, index) => ({
    ...band,
    color: ORDINAL_RAMP[Math.min(index, ORDINAL_RAMP.length - 1)],
  }))
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-small text-ink-muted">
        <span className="font-heading text-[22px] leading-7 font-semibold text-ink">
          {match.avg_pct === null ? '—' : `${match.avg_pct}%`}
        </span>{' '}
        average across {formatCount(match.scored)} scored
      </p>
      <BarRows
        aria-label="Candidates by match score"
        rows={rows}
        onSelect={(row) => onSelect(match.bands.find((band) => band.key === row.key)!)}
      />
    </div>
  )
}
