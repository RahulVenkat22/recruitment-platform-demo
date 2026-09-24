import {
  BriefcaseIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  FileWarningIcon,
  HourglassIcon,
  MessageSquareTextIcon,
  PhoneMissedIcon,
  type LucideIcon,
} from 'lucide-react'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import type { AttentionCounts } from '@/types/domain'

export type AttentionKey = keyof AttentionCounts

const ITEMS: readonly {
  key: AttentionKey
  label: string
  description: string
  icon: LucideIcon
}[] = [
  {
    key: 'overdue_follow_ups',
    label: 'Overdue follow-ups',
    description: 'Contacted candidates, next action past due',
    icon: PhoneMissedIcon,
  },
  {
    key: 'feedback_pending',
    label: 'Interview feedback owed',
    description: 'Held, but no feedback submitted yet',
    icon: MessageSquareTextIcon,
  },
  {
    key: 'offers_expiring',
    label: 'Offers expiring',
    description: 'Past expiry or due within 3 days',
    icon: FileWarningIcon,
  },
  {
    key: 'stale_candidates',
    label: 'Stuck for a week',
    description: 'No stage change in 7 days',
    icon: HourglassIcon,
  },
  {
    key: 'quiet_roles',
    label: 'Quiet roles',
    description: 'Nothing logged in 7 days',
    icon: BriefcaseIcon,
  },
]

export interface AttentionItem {
  key: AttentionKey
  label: string
}

/** What is waiting on someone, each row a button that opens those records in place. */
export function AttentionList({
  counts,
  onSelect,
}: {
  counts: AttentionCounts
  onSelect: (item: AttentionItem) => void
}) {
  const open = ITEMS.reduce((sum, item) => sum + counts[item.key], 0)
  return (
    <div className="flex h-full flex-col">
      <ul className="divide-y divide-line" aria-label="Needs attention">
        {ITEMS.map((item) => {
          const value = counts[item.key]
          const clear = value === 0
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect({ key: item.key, label: item.label })}
                data-slot="attention-row"
                data-clear={clear || undefined}
                className={cn(
                  'group/row flex w-[calc(100%+1rem)] items-center gap-3 py-2.5 text-left transition-colors duration-150 ease-brand hover:bg-surface-2',
                  '-mx-2 rounded-control px-2',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4',
                    clear ? 'bg-surface-2 text-ink-subtle' : 'bg-warning-soft text-warning',
                  )}
                >
                  <item.icon strokeWidth={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-small font-medium',
                      clear ? 'text-ink-muted' : 'text-ink',
                    )}
                  >
                    {item.label}
                  </span>
                  <span className="block truncate text-caption text-ink-subtle">
                    {item.description}
                  </span>
                </span>
                <span
                  className={cn(
                    'inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-pill px-2 text-small font-medium tabular-nums',
                    clear ? 'bg-surface-2 text-ink-subtle' : 'bg-warning-soft text-warning',
                  )}
                >
                  {formatCount(value)}
                </span>
                <ChevronRightIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover/row:opacity-100"
                />
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-auto flex items-center gap-1.5 border-t border-line pt-3 text-caption text-ink-subtle">
        {open === 0 ? (
          <>
            <CircleCheckIcon aria-hidden="true" className="size-3.5 text-success" />
            All clear right now.
          </>
        ) : (
          <>{formatCount(open)} things waiting right now.</>
        )}
      </p>
    </div>
  )
}
