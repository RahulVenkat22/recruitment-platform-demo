import { BellIcon, CheckCheckIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import {
  useMarkAllRead,
  useMarkRead,
  useNotifications,
  useUnreadCount,
} from '@/features/notifications/api'
import { linkFor, TYPE_ICONS } from '@/features/notifications/notification-utils'
import { useAuthStore } from '@/lib/auth-store'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types/domain'

const LATEST = 8

/** plan.md 8.4 NotificationBell: unread badge (polled), popover with the latest 8, mark all read, view all. */
export function NotificationBell() {
  const authed = useAuthStore((state) => state.status === 'authed')
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const unread = useUnreadCount(authed)
  const latest = useNotifications({ page_size: LATEST }, authed && open)
  const markRead = useMarkRead()
  const markAll = useMarkAllRead()
  const count = unread.data?.unread ?? 0
  const label = count === 1 ? 'Notifications, 1 unread' : `Notifications, ${count} unread`
  const shown = count > 99 ? '99+' : String(count)

  function openItem(row: Notification) {
    setOpen(false)
    if (!row.is_read) markRead.mutate(row.id)
    navigate(linkFor(row))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* A real link to the page (new-tab and middle-click work); a plain click toggles the popover. */}
      <PopoverAnchor asChild>
        <Button
          asChild
          variant="ghost"
          size="icon-sm"
          className="relative text-ink-muted hover:text-ink"
        >
          <Link
            to="/notifications"
            aria-label={label}
            aria-expanded={open}
            aria-haspopup="dialog"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
              event.preventDefault()
              setOpen((value) => !value)
            }}
          >
            <BellIcon aria-hidden="true" />
            <span
              aria-hidden="true"
              data-slot="notification-count"
              className={cn(
                'absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-pill px-1 text-[10px] leading-none font-medium tabular-nums ring-2 ring-surface',
                count > 0 ? 'bg-primary text-white' : 'bg-surface-2 text-ink-subtle',
              )}
            >
              {shown}
            </span>
          </Link>
        </Button>
      </PopoverAnchor>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-small font-medium text-ink">Notifications</h2>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={count === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheckIcon data-icon="inline-start" aria-hidden="true" />
            Mark all read
          </Button>
        </div>
        <ul className="max-h-96 overflow-y-auto" aria-label="Latest notifications">
          {latest.isPending ? (
            <li className="px-4 py-6 text-center text-small text-ink-subtle">Loading…</li>
          ) : (latest.data?.results.length ?? 0) === 0 ? (
            <li className="px-4 py-8 text-center text-small text-ink-subtle">
              You're all caught up.
            </li>
          ) : (
            latest.data?.results.map((row) => {
              const Icon = TYPE_ICONS[row.type] ?? BellIcon
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => openItem(row)}
                    data-slot="notification-row"
                    data-unread={!row.is_read}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2',
                      !row.is_read && 'bg-primary-soft/50',
                    )}
                  >
                    {row.actor ? (
                      <Avatar name={row.actor.full_name} src={row.actor.avatar_url} size="sm" />
                    ) : (
                      <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface-2 text-ink-subtle">
                        <Icon aria-hidden="true" className="size-3.5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block truncate text-small',
                          row.is_read ? 'text-ink' : 'font-medium text-ink',
                        )}
                      >
                        {row.title}
                      </span>
                      {row.message && (
                        <span className="block truncate text-caption text-ink-muted">
                          {row.message}
                        </span>
                      )}
                      <span className="block text-caption text-ink-subtle">
                        {row.actor?.full_name ? `${row.actor.full_name} · ` : ''}
                        {formatRelative(row.created_at)}
                      </span>
                    </span>
                    {!row.is_read && (
                      <span
                        aria-hidden="true"
                        className="mt-2 size-2 shrink-0 rounded-full bg-primary"
                      />
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>
        <div className="border-t border-line px-4 py-2 text-center">
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="text-small font-medium text-primary hover:underline"
          >
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
