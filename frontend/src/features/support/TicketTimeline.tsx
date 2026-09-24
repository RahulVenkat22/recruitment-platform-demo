import {
  ArrowRightIcon,
  CpuIcon,
  FlagIcon,
  MessageSquareTextIcon,
  PencilLineIcon,
  ShuffleIcon,
  TicketIcon,
  UserPlusIcon,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AttachmentGallery } from '@/features/support/AttachmentGallery'
import { useEnumMeta } from '@/lib/enums'
import { formatDateTime, formatWhen } from '@/lib/format'
import { humaniseField, type Metadata } from '@/lib/timeline'
import { cn } from '@/lib/utils'
import type { TicketEvent } from '@/types/domain'

const KIND_ICONS: Record<string, LucideIcon> = {
  created: TicketIcon,
  comment: MessageSquareTextIcon,
  status: ShuffleIcon,
  assignment: UserPlusIcon,
  priority: FlagIcon,
  edit: PencilLineIcon,
}

/** Marker colour per kind; a status change takes the colour of the status it moved into. */
const KIND_COLORS: Record<string, string> = {
  created: '#6b7500',
  comment: '#5d615c',
  assignment: '#3f3fb5',
  priority: '#b7791f',
  edit: '#8f8f88',
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'nothing'
  if (typeof value === 'object' && value !== null && 'title' in value) {
    return String((value as { title: unknown }).title)
  }
  return String(value)
}

function Person({ value }: { value: unknown }) {
  const person = value as { name?: string; avatar_url?: string | null } | null
  if (!person?.name) return <span className="text-ink-subtle">nobody</span>
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar name={person.name} src={person.avatar_url} size="xs" />
      <span className="font-medium text-ink">{person.name}</span>
    </span>
  )
}

function Entry({ event, last }: { event: TicketEvent; last: boolean }) {
  const metadata = (event.metadata ?? {}) as Metadata
  const statusTo = event.kind === 'status' ? String(metadata.to ?? '') : ''
  const toMeta = useEnumMeta('ticket_status', statusTo || 'open')
  const Icon = KIND_ICONS[event.kind] ?? TicketIcon
  const color = event.kind === 'status' ? toMeta.fg : (KIND_COLORS[event.kind] ?? KIND_COLORS.edit)
  const changes =
    event.kind === 'edit'
      ? Object.entries(
          (metadata.changes as Record<string, { from: unknown; to: unknown }> | undefined) ?? {},
        ).map(([field, change]) => ({ field, ...change }))
      : []
  const hasStatuses = typeof metadata.from === 'string' && typeof metadata.to === 'string'

  return (
    <li
      data-slot="ticket-event"
      data-kind={event.kind}
      className="relative flex gap-3 pb-6 last:pb-0"
    >
      {!last && <span aria-hidden="true" className="absolute top-8 bottom-0 left-4 w-px bg-line" />}
      <span
        aria-hidden="true"
        className="relative z-[1] inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface ring-2 [&_svg]:size-4"
        style={{ color, boxShadow: `0 0 0 2px ${color}22` }}
      >
        <Icon strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {event.actor ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex shrink-0">
                  <Avatar name={event.actor.full_name} src={event.actor.avatar_url} size="xs" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{event.actor.full_name}</TooltipContent>
            </Tooltip>
          ) : (
            <span
              aria-label="System"
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-subtle"
            >
              <CpuIcon aria-hidden="true" className="size-3" />
            </span>
          )}
          <p className="min-w-0 text-small text-ink">{event.title}</p>
          <span
            className="ml-auto shrink-0 text-caption text-ink-subtle"
            title={formatDateTime(event.occurred_at)}
          >
            {formatWhen(event.occurred_at)}
          </span>
        </div>
        {event.kind === 'status' && hasStatuses && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={String(metadata.from)} kind="ticket_status" dot />
            <ArrowRightIcon aria-hidden="true" className="size-3.5 text-ink-subtle" />
            <StatusBadge status={String(metadata.to)} kind="ticket_status" dot />
          </p>
        )}
        {event.kind === 'priority' && hasStatuses && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={String(metadata.from)} kind="ticket_priority" />
            <ArrowRightIcon aria-hidden="true" className="size-3.5 text-ink-subtle" />
            <StatusBadge status={String(metadata.to)} kind="ticket_priority" />
          </p>
        )}
        {event.kind === 'assignment' && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-small">
            <Person value={metadata.from} />
            <ArrowRightIcon aria-hidden="true" className="size-3.5 text-ink-subtle" />
            <Person value={metadata.to} />
          </p>
        )}
        {changes.length > 0 && (
          <dl className="mt-1.5 space-y-0.5 text-small">
            {changes.map((change) => (
              <div key={change.field} className="flex flex-wrap items-baseline gap-x-2">
                <dt className="text-ink-subtle">{humaniseField(change.field)}</dt>
                <dd className="text-ink-muted">
                  <span className="line-through decoration-line-strong">
                    {valueText(change.from)}
                  </span>
                  <ArrowRightIcon
                    aria-hidden="true"
                    className="mx-1 inline size-3 text-ink-subtle"
                  />
                  <span className="text-ink">{valueText(change.to)}</span>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {event.message && (
          <div
            className={cn(
              'mt-2 text-small whitespace-pre-line text-ink',
              event.kind === 'comment'
                ? 'rounded-card border border-line bg-surface-2 px-3 py-2'
                : 'text-ink-muted',
            )}
          >
            {event.message}
          </div>
        )}
        <AttachmentGallery attachments={event.attachments} className="mt-2" />
      </div>
    </li>
  )
}

/** The ticket's history, oldest first, so a reader follows the conversation down the page. */
export function TicketTimeline({ events }: { events: readonly TicketEvent[] }) {
  return (
    <ol className="list-none" aria-label="Ticket timeline">
      {events.map((event, index) => (
        <Entry key={event.id} event={event} last={index === events.length - 1} />
      ))}
    </ol>
  )
}
