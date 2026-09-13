import { HistoryIcon, SearchIcon, SearchXIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonTimeline } from '@/components/shared/Skeletons'
import { Timeline } from '@/components/shared/Timeline'
import { TimelineFilterChips } from '@/components/shared/TimelineFilterChips'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { flattenActivities, useTimeline } from '@/features/activity/api'
import { ACTIVITY_CATEGORIES } from '@/lib/enums'
import { param, useUrlState } from '@/lib/hooks'
import { matchesText } from '@/lib/timeline'
import type { JobDetail } from '@/types/domain'

const ANYONE = '__anyone__'

const TIMELINE_SPEC = {
  cat: param.list<string>(ACTIVITY_CATEGORIES),
  actor: param.string(''),
}

/** plan.md 9.6 Timeline tab: category chips, text and person filters, day-grouped events, load older. */
export function TimelineTab({ job }: { job: JobDetail }) {
  const [{ cat, actor }, setUrl] = useUrlState(TIMELINE_SPEC)
  const [text, setText] = useState('')
  const feed = useTimeline({ job_description: job.id })
  const loaded = useMemo(() => flattenActivities(feed.data), [feed.data])
  const first = feed.data?.pages[0]
  const counts = first?.counts ?? {}
  const total = first?.total ?? 0

  const actors = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of loaded) {
      if (item.actor) map.set(item.actor.id, item.actor.full_name)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [loaded])

  const selected = useMemo(() => new Set(cat), [cat])
  const visible = useMemo(
    () =>
      loaded.filter(
        (item) =>
          selected.has(item.category) &&
          (!actor || item.actor?.id === actor) &&
          matchesText(item, text),
      ),
    [loaded, selected, actor, text],
  )
  const filtered = cat.length !== ACTIVITY_CATEGORIES.length || Boolean(actor) || text.trim() !== ''

  function clearFilters() {
    setText('')
    setUrl({ cat: [...ACTIVITY_CATEGORIES], actor: '' })
  }

  return (
    <div className="space-y-4">
      <section
        aria-label="Timeline filters"
        className="rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <div className="flex flex-wrap items-start gap-3">
          <span className="pt-1 text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase">
            Timeline filters
          </span>
          <TimelineFilterChips
            selected={cat}
            onChange={(next) => setUrl({ cat: next })}
            counts={counts}
            className="min-w-0 flex-1"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <div className="relative min-w-0 flex-1 basis-56">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
            />
            <Input
              type="search"
              aria-label="Filter by candidate or person"
              placeholder="Filter by candidate or person"
              value={text}
              onChange={(event) => setText(event.target.value)}
              className="pl-8"
            />
          </div>
          <Select
            value={actor || ANYONE}
            onValueChange={(value) => setUrl({ actor: value === ANYONE ? '' : value })}
          >
            <SelectTrigger aria-label="Person" className="w-48 max-sm:w-full">
              <SelectValue placeholder="Person" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANYONE}>Anyone</SelectItem>
              {actors.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span role="status" className="ml-auto text-small text-ink-muted tabular-nums">
            {feed.isPending ? 'Loading events…' : `Showing ${visible.length} of ${total} events`}
          </span>
        </div>
      </section>

      {feed.isPending ? (
        <SkeletonTimeline items={6} className="pt-2" />
      ) : feed.isError ? (
        <ErrorState
          title="Couldn't load the timeline"
          error={feed.error}
          onRetry={() => void feed.refetch()}
        />
      ) : loaded.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="Nothing has happened yet"
          description="Searches, shortlists, contacts, interviews and decisions on this job description will show up here."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={SearchXIcon}
          title="No events match these filters"
          description="Turn a category back on or clear the person and text filters."
          action={
            filtered ? (
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Timeline
          items={visible}
          jobId={job.id}
          hasMore={feed.hasNextPage}
          loadingOlder={feed.isFetchingNextPage}
          onLoadOlder={() => void feed.fetchNextPage()}
          className="pt-2"
        />
      )}
    </div>
  )
}
