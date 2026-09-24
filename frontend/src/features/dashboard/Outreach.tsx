import { BarRows } from '@/features/dashboard/BarRows'
import { StackedBar } from '@/features/dashboard/charts/StackedBar'
import { SERIES } from '@/features/dashboard/charts/theme'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import type { KeyCount, OutreachInsight } from '@/types/domain'

/**
 * How candidates were reached across the window: the channel split on the
 * categorical colours (a channel opens its messages), then what came of it.
 */
export function Outreach({
  outreach,
  onSelect,
}: {
  outreach: OutreachInsight
  onSelect: (channel: KeyCount) => void
}) {
  const channels = outreach.channels.map((channel, index) => ({
    ...channel,
    color: SERIES[index % SERIES.length],
  }))
  const outcomes = outreach.outcomes.filter((row) => row.value > 0)
  if (outreach.total === 0) {
    return (
      <p className="text-small text-ink-subtle">
        No calls, emails or messages were logged in this window.
      </p>
    )
  }
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-caption text-ink-subtle">
          <span>By channel</span>
          <span className="tabular-nums">{formatCount(outreach.total)} logged</span>
        </div>
        <StackedBar segments={channels} title="Communications by channel" />
        <ul className="mt-2 flex flex-wrap gap-x-1 gap-y-1" aria-label="Channels">
          {channels.map((channel) => (
            <li key={channel.key}>
              <button
                type="button"
                onClick={() => onSelect(channel)}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-control px-2 text-caption text-ink-muted transition-colors duration-150 ease-brand hover:bg-surface-2',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-[3px]"
                  style={{ background: channel.color }}
                />
                {channel.label}
                <span className="font-medium text-ink tabular-nums">{channel.value}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="mb-1.5 text-caption text-ink-subtle">What came of it</p>
        <BarRows
          aria-label="Communication outcomes"
          rows={outcomes.map((row) => ({ ...row, color: SERIES[0] }))}
        />
      </div>
    </div>
  )
}
