import { ChevronDownIcon, CpuIcon, Loader2Icon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Avatar } from '@/components/shared/Avatar'
import { TimelineItemDetails } from '@/components/shared/TimelineItemDetails'
import { Button } from '@/components/ui/button'
import { useEnumMeta } from '@/lib/enums'
import { formatDateTime, formatTime } from '@/lib/format'
import { groupByDay, type Metadata } from '@/lib/timeline'
import { cn } from '@/lib/utils'
import type { Activity } from '@/types/domain'

export interface TimelineProps {
  items: readonly Activity[]
  groupByDay?: boolean
  /** Adds `?jd=` context to candidate links inside the items. */
  jobId?: string
  hasMore?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void
  /** Extra content per item, rendered under the details block. */
  renderExtra?: (item: Activity) => ReactNode
  className?: string
}

const HIDDEN_META_KEYS = new Set(['changed_fields', 'participants', 'candidates', 'sources'])

function MetadataList({ metadata }: { metadata: Metadata }) {
  const entries = Object.entries(metadata).filter(
    ([key, value]) =>
      !HIDDEN_META_KEYS.has(key) && value !== null && value !== '' && value !== undefined,
  )
  if (entries.length === 0) return null
  return (
    <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-control bg-surface-2 px-3 py-2 text-caption">
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="text-ink-subtle">{key.replace(/_/g, ' ')}</dt>
          <dd className="min-w-0 break-words text-ink">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function TimelineEntry({
  item,
  jobId,
  renderExtra,
}: {
  item: Activity
  jobId?: string
  renderExtra?: (item: Activity) => ReactNode
}) {
  const meta = useEnumMeta('category', item.category)
  const [expanded, setExpanded] = useState(false)
  const metadata = (item.metadata ?? {}) as Metadata
  const expandable = Object.keys(metadata).some((key) => !HIDDEN_META_KEYS.has(key))

  return (
    <div data-slot="timeline-item" data-category={item.category} className="relative pl-8">
      <span
        aria-hidden="true"
        className="absolute top-1.5 left-[10px] size-3 rounded-full ring-2 ring-surface"
        style={{ backgroundColor: meta.fg }}
      />
      <div className="flex items-start gap-3">
        <span
          className="w-16 shrink-0 pt-0.5 text-caption text-ink-subtle tabular-nums"
          title={formatDateTime(item.occurred_at)}
        >
          {formatTime(item.occurred_at)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            {item.actor ? (
              <Avatar
                name={item.actor.full_name}
                src={item.actor.avatar_url}
                size="xs"
                className="mt-0.5"
              />
            ) : (
              <span
                aria-label="System"
                className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-subtle"
              >
                <CpuIcon aria-hidden="true" className="size-3" />
              </span>
            )}
            <p className="min-w-0 flex-1 text-body text-ink">{item.title}</p>
            {expandable && (
              <button
                type="button"
                aria-expanded={expanded}
                aria-label={expanded ? 'Hide details' : 'Show details'}
                onClick={() => setExpanded((value) => !value)}
                className="inline-flex size-6 shrink-0 items-center justify-center rounded-control text-ink-subtle hover:bg-surface-2 hover:text-ink"
              >
                <ChevronDownIcon
                  aria-hidden="true"
                  className={cn(
                    'size-4 transition-transform duration-150',
                    expanded && 'rotate-180',
                  )}
                />
              </button>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 pl-7 text-small text-ink-muted">{item.description}</p>
          )}
          <div className="pl-7">
            <TimelineItemDetails item={item} jobId={jobId} />
            {renderExtra?.(item)}
            {expanded && <MetadataList metadata={metadata} />}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Vertical timeline (plan.md 8.4): a line at 16px, category-coloured indicators,
 * day headers, and items that animate in and out as filters change.
 */
export function Timeline({
  items,
  groupByDay: grouped = true,
  jobId,
  hasMore = false,
  loadingOlder = false,
  onLoadOlder,
  renderExtra,
  className,
}: TimelineProps) {
  const reducedMotion = useReducedMotion()
  const days = grouped ? groupByDay(items) : [{ key: 'all', label: '', items: [...items] }]
  const motionProps = reducedMotion
    ? {}
    : {
        initial: { opacity: 0, y: -6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, height: 0, marginBottom: 0 },
        transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
      }

  return (
    <div data-slot="timeline" className={cn('relative', className)}>
      <span aria-hidden="true" className="absolute top-2 bottom-2 left-4 w-px bg-line" />
      <AnimatePresence initial={false}>
        {days.map((day) => (
          <motion.section key={day.key} layout={!reducedMotion} {...motionProps} className="mb-6">
            {day.label && (
              <h3 className="relative mb-3 pl-8 text-small font-medium text-ink">
                <span
                  className="absolute top-1/2 left-[13px] size-1.5 -translate-y-1/2 rounded-full bg-line-strong"
                  aria-hidden="true"
                />
                {day.label}
              </h3>
            )}
            <ul className="space-y-4">
              <AnimatePresence initial={false}>
                {day.items.map((item) => (
                  <motion.li key={item.id} layout={!reducedMotion} {...motionProps}>
                    <TimelineEntry item={item} jobId={jobId} renderExtra={renderExtra} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.section>
        ))}
      </AnimatePresence>
      {hasMore && onLoadOlder && (
        <div className="pl-8">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onLoadOlder}
            disabled={loadingOlder}
          >
            {loadingOlder && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Load older events
          </Button>
        </div>
      )}
    </div>
  )
}
