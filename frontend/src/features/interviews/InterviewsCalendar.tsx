import { CalendarXIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import { addDays, format, isSameDay, isToday, parseISO } from 'date-fns'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { candidateHrefFor } from '@/features/interviews/interview-utils'
import { weekDays, weekKey } from '@/lib/datetime'
import { formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Interview } from '@/types/domain'

export interface InterviewsCalendarProps {
  /** Monday of the week shown, as "yyyy-MM-dd". */
  weekStart: string
  onWeekChange: (weekStart: string) => void
  interviews: readonly Interview[]
  loading?: boolean
  /** The week query's error, when it failed; the week navigation stays usable. */
  error?: unknown
  onRetry?: () => void
}

/** Solid dot colour per status; spelled out so Tailwind generates each class. */
const STATUS_DOT_CLASS: Record<string, string> = {
  scheduled: 'bg-info',
  rescheduled: 'bg-warning',
  completed: 'bg-success',
  cancelled: 'bg-ink-muted',
  no_show: 'bg-danger',
}

/** Chip placeholders per weekday while the first week loads; varied so it reads as a calendar. */
const SKELETON_CHIPS = [2, 1, 2, 3, 1, 2, 1]

const GRID_CLASS = 'grid min-w-[840px] grid-cols-7 divide-x divide-line'

function dayLabel(day: Date, count: number): string {
  const interviews = count === 1 ? '1 interview' : `${count} interviews`
  return `${format(day, 'EEEE d MMMM')}, ${interviews}`
}

/** plan.md 9.11 calendar view: a simple week grid with interview chips, no drag. */
export function InterviewsCalendar({
  weekStart,
  onWeekChange,
  interviews,
  loading = false,
  error,
  onRetry,
}: InterviewsCalendarProps) {
  const start = parseISO(weekStart)
  const days = useMemo(() => weekDays(start), [weekStart]) // eslint-disable-line react-hooks/exhaustive-deps
  const byDay = useMemo(
    () =>
      days.map((day) =>
        interviews
          .filter((interview) => isSameDay(parseISO(interview.scheduled_at), day))
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at)),
      ),
    [days, interviews],
  )
  // With keepPreviousData only the very first week shows a skeleton; later weeks swap in place.
  const busy = loading && interviews.length === 0
  const failed = error !== undefined && error !== null

  let grid: ReactNode
  if (failed) {
    grid = <ErrorState title="Couldn't load this week" error={error} onRetry={onRetry} />
  } else if (busy) {
    grid = (
      <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
        <div aria-busy="true" aria-label="Loading week" className={GRID_CLASS}>
          {days.map((day, index) => (
            <div key={day.toISOString()} className="min-h-72">
              <div className="border-b border-line bg-surface-2 px-3 py-2">
                <Skeleton className="h-3 w-12 bg-surface-3" />
              </div>
              <div className="space-y-1.5 p-2">
                {Array.from({ length: SKELETON_CHIPS[index] }, (_, chip) => (
                  <SkeletonCard key={chip} lines={1} className="p-2 shadow-none" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  } else {
    grid = (
      <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
        {interviews.length === 0 && (
          <EmptyState
            size="sm"
            icon={CalendarXIcon}
            title="No interviews this week"
            description="Use the arrows to move between weeks."
            className="border-b border-line"
          />
        )}
        <ol aria-label="Week calendar" className={GRID_CLASS}>
          {days.map((day, index) => {
            const today = isToday(day)
            return (
              <li
                key={day.toISOString()}
                aria-label={dayLabel(day, byDay[index].length)}
                aria-current={today ? 'date' : undefined}
                className="min-h-72"
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    'border-b border-line px-3 py-4 text-caption font-medium tracking-[0.06em] uppercase',
                    today ? 'bg-primary-soft text-primary' : 'bg-surface-2 text-ink-subtle',
                  )}
                >
                  {format(day, 'EEE d')}
                </div>
                {byDay[index].length > 0 && (
                  <ul className="space-y-1.5 p-2">
                    {byDay[index].map((interview) => (
                      <li key={interview.id}>
                        <Link
                          to={candidateHrefFor(interview)}
                          data-slot="calendar-chip"
                          data-status={interview.status}
                          className={cn(
                            'block rounded-control border border-line bg-surface px-2 py-1.5 text-caption transition-colors hover:border-line-strong hover:bg-surface-2',
                            interview.status === 'cancelled' && 'opacity-60 line-through',
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium text-ink tabular-nums">
                              {formatTime(interview.scheduled_at)}
                            </span>
                            <span className="ml-auto inline-flex items-center">
                              <span className="sr-only">{interview.status_label}</span>
                              <span
                                aria-hidden="true"
                                className={cn(
                                  'size-1.5 rounded-full',
                                  STATUS_DOT_CLASS[interview.status] ?? 'bg-ink-subtle',
                                )}
                              />
                            </span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5">
                            <Avatar
                              name={interview.application.candidate.full_name}
                              src={interview.application.candidate.avatar_url}
                              size="xs"
                            />
                            <span className="truncate text-ink">
                              {interview.application.candidate.full_name}
                            </span>
                          </span>
                          <span className="block truncate text-ink-subtle">
                            {interview.round_label} ·{' '}
                            {interview.interviewer.full_name.split(' ')[0]}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous week"
          onClick={() => onWeekChange(weekKey(addDays(start, -7)))}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next week"
          onClick={() => onWeekChange(weekKey(addDays(start, 7)))}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onWeekChange(weekKey(new Date()))}>
          This week
        </Button>
        <h3 className="ml-1 text-h3 text-ink">
          {format(days[0], 'd MMM')} – {format(days[6], 'd MMM yyyy')}
        </h3>
      </div>
      {grid}
    </div>
  )
}
