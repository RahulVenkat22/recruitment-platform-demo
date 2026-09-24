import { formatCount } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import type { SearchStats as Stats } from '@/types/domain'

function Stat({
  label,
  value,
  hint,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-w-0 rounded-control bg-surface-2 px-3 py-2 text-left transition-colors duration-150 ease-brand hover:bg-surface-3',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      )}
    >
      <span className="block text-caption text-ink-subtle">{label}</span>
      <span className="mt-0.5 block font-heading text-[22px] leading-7 font-semibold text-ink">
        {value}
      </span>
      {hint && <span className="block truncate text-caption text-ink-subtle">{hint}</span>}
    </button>
  )
}

/** What the AI searches brought in across the window; any figure opens the runs. */
export function SearchStats({ searches, onSelect }: { searches: Stats; onSelect: () => void }) {
  const seconds = searches.avg_duration_ms === null ? null : searches.avg_duration_ms / 1000
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Searches run" value={formatCount(searches.runs)} onClick={onSelect} />
        <Stat
          label="Profiles found"
          value={formatCount(searches.found)}
          hint={`${formatCount(searches.new)} new to the database`}
          onClick={onSelect}
        />
        <Stat
          label="AI shortlisted"
          value={formatCount(searches.shortlisted)}
          hint={
            searches.found
              ? `${Math.round((searches.shortlisted / searches.found) * 100)}% of found`
              : undefined
          }
          onClick={onSelect}
        />
        <Stat
          label="Avg search time"
          value={
            seconds === null
              ? '—'
              : seconds < 60
                ? `${seconds.toFixed(0)}s`
                : `${(seconds / 60).toFixed(1)}m`
          }
          onClick={onSelect}
        />
      </div>
      <p className="mt-auto border-t border-line pt-3 text-caption text-ink-subtle">
        {searches.runs === 0
          ? 'No searches were run in this window.'
          : 'Click a figure to see every search run in this window.'}
      </p>
    </div>
  )
}
