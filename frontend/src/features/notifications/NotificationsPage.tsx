import { BellIcon, BellOffIcon, CheckCheckIcon } from 'lucide-react'
import { useId, useMemo } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FilterChips } from '@/components/shared/FilterChips'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { StaggerItem } from '@/components/shared/Stagger'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '@/features/notifications/api'
import { linkFor, TYPE_ICONS } from '@/features/notifications/notification-utils'
import { describeError } from '@/lib/errors'
import { formatDayHeading, formatRelative } from '@/lib/format'
import { param, useUrlState } from '@/lib/hooks'
import { useUiStore, type PageSize } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types/domain'

const SPEC = {
  filter: param.enum<'all' | 'unread'>('all', ['all', 'unread']),
  page: param.number(1),
}

interface DayGroup {
  key: string
  label: string
  /** Rows before this day on the page, so the stagger runs across day boundaries. */
  offset: number
  rows: Notification[]
}

function groupByDay(rows: readonly Notification[]): DayGroup[] {
  const days: DayGroup[] = []
  rows.forEach((row, index) => {
    const key = row.created_at.slice(0, 10)
    const last = days[days.length - 1]
    if (last && last.key === key) last.rows.push(row)
    else days.push({ key, label: formatDayHeading(row.created_at), offset: index, rows: [row] })
  })
  return days
}

const LIST_CLASS = 'overflow-hidden rounded-card border border-line bg-surface shadow-card'
const ROW_CLASS = 'border-b border-line last:border-0'

/** Same shape as one day group: a caption line, then a bordered list of avatar rows. */
function NotificationsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading notifications">
      <Skeleton className="mb-2 h-3 w-24 bg-surface-3" />
      <ul className={LIST_CLASS}>
        {Array.from({ length: 5 }, (_, index) => (
          <li key={index} className={cn(ROW_CLASS, 'flex items-start gap-3 px-4 py-3')}>
            <Skeleton className="size-6 shrink-0 rounded-full bg-surface-3" />
            <div className="min-w-0 flex-1 space-y-2 py-0.5">
              <Skeleton className={cn('h-3.5 bg-surface-3', index % 2 ? 'w-1/2' : 'w-2/3')} />
              <Skeleton className="h-3 w-1/3 bg-surface-3" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** plan.md 9.12 Notifications: grouped by day, unread rows highlighted, All / Unread, mark all read. */
export default function NotificationsPage() {
  const [state, setState] = useUrlState(SPEC)
  const headingId = useId()
  const pageSize = useUiStore((s) => s.pageSize)
  const setPageSize = useUiStore((s) => s.setPageSize)
  const unreadOnly = state.filter === 'unread'
  const list = useNotifications({
    page: state.page,
    page_size: pageSize,
    unread: unreadOnly,
  })
  // While filtering to unread, keep the first unfiltered page warm: it tells the empty state
  // whether anything exists at all, and "Show all" then renders from cache.
  const everything = useNotifications({ page: 1, page_size: pageSize }, unreadOnly)
  const unread = useUnreadCount()
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const days = useMemo(() => groupByDay(list.data?.results ?? []), [list.data])
  const total = list.data?.count ?? 0
  const hasAny = (everything.data?.count ?? 0) > 0

  async function readAll() {
    try {
      const result = await markAll.mutateAsync()
      toast.success(result.marked ? `Marked ${result.marked} as read` : 'Nothing unread')
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  let emptyState = (
    <EmptyState
      icon={BellIcon}
      title="You're all caught up"
      description="Notifications arrive as candidates move through the pipeline."
    />
  )
  if (unreadOnly && hasAny) {
    emptyState = (
      <EmptyState
        icon={BellOffIcon}
        title="No unread notifications"
        description="Everything here has been read."
        action={
          <Button variant="outline" onClick={() => setState({ filter: 'all', page: 1 })}>
            Show all
          </Button>
        }
      />
    )
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Assignments, status changes, interviews, feedback, offers, onboarding and support tickets across your roles."
        breadcrumbs={[{ label: 'Notifications' }]}
        actions={
          <Button
            type="button"
            variant="outline"
            disabled={(unread.data?.unread ?? 0) === 0 || markAll.isPending}
            onClick={() => void readAll()}
          >
            <CheckCheckIcon data-icon="inline-start" aria-hidden="true" />
            Mark all as read
          </Button>
        }
      />
      <div className="space-y-4">
        <FilterChips
          aria-label="Notification filter"
          options={[
            { key: 'all', label: 'All' },
            { key: 'unread', label: 'Unread', count: unread.data?.unread },
          ]}
          selected={[state.filter]}
          onChange={(next) => {
            const chosen = (next.find((key) => key !== state.filter) ?? 'all') as 'all' | 'unread'
            setState({ filter: chosen, page: 1 })
          }}
        />
        {list.isPending ? (
          <NotificationsSkeleton />
        ) : list.isError ? (
          <ErrorState
            title="Couldn't load notifications"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : days.length === 0 ? (
          emptyState
        ) : (
          <div className="space-y-6">
            {days.map((day) => {
              const dayHeadingId = `${headingId}-${day.key}`
              return (
                <section key={day.key} aria-labelledby={dayHeadingId}>
                  <h2
                    id={dayHeadingId}
                    className="mb-2 text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase"
                  >
                    {day.label}
                  </h2>
                  <ul className={LIST_CLASS}>
                    {day.rows.map((row, index) => {
                      const Icon = TYPE_ICONS[row.type] ?? BellIcon
                      return (
                        <li
                          key={row.id}
                          data-slot="notification-row"
                          data-unread={!row.is_read}
                          className={cn(ROW_CLASS, !row.is_read && 'bg-primary-soft/50')}
                        >
                          <StaggerItem
                            index={day.offset + index}
                            className="flex flex-wrap items-start gap-3 px-4 py-3"
                          >
                            {row.actor ? (
                              <Avatar
                                name={row.actor.full_name}
                                src={row.actor.avatar_url}
                                size="sm"
                              />
                            ) : (
                              <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-subtle">
                                <Icon aria-hidden="true" className="size-3.5" />
                              </span>
                            )}
                            {/* Grows to fill the row; below 12rem the "Mark read" button wraps under it. */}
                            <div className="min-w-0 grow basis-48">
                              <Link
                                to={linkFor(row)}
                                onClick={() => !row.is_read && markRead.mutate(row.id)}
                                className={cn(
                                  'block text-small text-ink hover:underline',
                                  !row.is_read && 'font-medium',
                                )}
                              >
                                {!row.is_read && <span className="sr-only">Unread: </span>}
                                {row.title}
                              </Link>
                              {row.message && (
                                <p className="text-caption text-ink-muted">{row.message}</p>
                              )}
                              <p className="text-caption text-ink-subtle">
                                {row.actor?.full_name ? `${row.actor.full_name} · ` : ''}
                                {row.type_label} · {formatRelative(row.created_at)}
                              </p>
                            </div>
                            {!row.is_read && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="xs"
                                className="shrink-0"
                                onClick={() => markRead.mutate(row.id)}
                              >
                                Mark read
                              </Button>
                            )}
                          </StaggerItem>
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
            {total > pageSize && (
              <Pagination
                pageIndex={state.page - 1}
                pageSize={pageSize}
                total={total}
                onChange={({ pageIndex, pageSize: size }) => {
                  if (size !== pageSize) setPageSize(size as PageSize)
                  setState({ page: pageIndex + 1 })
                }}
              />
            )}
          </div>
        )}
      </div>
    </>
  )
}
