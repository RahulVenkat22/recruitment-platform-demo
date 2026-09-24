import { StackedBar } from '@/features/dashboard/charts/StackedBar'
import { OFFER_COLORS } from '@/features/dashboard/charts/theme'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import type { KeyCount, OffersInsight } from '@/types/domain'

/** Every offer by where it stands, and how fast candidates answered in the window. */
export function OffersMix({
  offers,
  onSelect,
}: {
  offers: OffersInsight
  onSelect: (status: KeyCount) => void
}) {
  const rows = offers.statuses.map((row) => ({
    ...row,
    color: OFFER_COLORS[row.key] ?? OFFER_COLORS.draft,
  }))
  const total = rows.reduce((sum, row) => sum + row.value, 0)
  if (total === 0) {
    return <p className="text-small text-ink-subtle">No offers have been drafted yet.</p>
  }
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="mb-0.5 flex items-center justify-between text-caption text-ink-subtle">
        <span>By status, right now</span>
        <span className="tabular-nums">{formatCount(total)} offers</span>
      </div>
      <StackedBar segments={rows} title="Offers by status" />
      <ul className="space-y-0.5" aria-label="Offer statuses">
        {rows
          .filter((row) => row.value > 0)
          .map((row) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onSelect(row)}
                className={cn(
                  '-mx-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-control px-2 py-1.5 text-left text-small transition-colors duration-150 ease-brand hover:bg-surface-2',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: row.color }}
                />
                <span className="min-w-0 flex-1 truncate text-ink">{row.label}</span>
                <span className="shrink-0 text-ink-subtle tabular-nums">
                  {total ? `${Math.round((row.value / total) * 100)}%` : '—'}
                </span>
                <span className="w-8 shrink-0 text-right font-medium text-ink tabular-nums">
                  {formatCount(row.value)}
                </span>
              </button>
            </li>
          ))}
      </ul>
      <p className="mt-auto border-t border-line pt-3 text-caption text-ink-subtle">
        {offers.responded === 0
          ? 'No responses landed in this window.'
          : `${formatCount(offers.responded)} ${offers.responded === 1 ? 'response' : 'responses'} in this window, ${offers.avg_response_days ?? '—'} days after sending on average.`}
      </p>
    </div>
  )
}
