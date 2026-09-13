import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  LinkIcon,
  MailIcon,
  MessageCircleIcon,
  MessageSquareDashedIcon,
  PhoneCallIcon,
  PhoneIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { Button } from '@/components/ui/button'
import { isActive, toTarget } from '@/features/applications/pipeline-target'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import { useCommunications } from '@/features/communications/api'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { ApplicationDetail, Communication } from '@/types/domain'

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  phone: PhoneIcon,
  email: MailIcon,
  linkedin: LinkIcon,
  whatsapp: MessageCircleIcon,
  in_person: UsersIcon,
}

const OUTCOME_CLASS: Record<string, string> = {
  connected: 'bg-success-soft text-success',
  replied: 'bg-success-soft text-success',
  callback_requested: 'bg-warning-soft text-warning',
  not_interested: 'bg-danger-soft text-danger',
}

function CommunicationRow({ row }: { row: Communication }) {
  const Icon = CHANNEL_ICONS[row.channel] ?? PhoneIcon
  const Direction = row.direction === 'inbound' ? ArrowDownLeftIcon : ArrowUpRightIcon
  const actor = row.performed_by
  const overdue = row.next_action_at ? new Date(row.next_action_at) < new Date() : false
  return (
    <li
      data-slot="communication"
      className="rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex items-start gap-3">
        {actor ? (
          <Avatar name={actor.full_name} src={actor.avatar_url} size="md" />
        ) : (
          <span className="size-8 rounded-full bg-surface-2" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-body text-ink">
              <span className="font-medium">{actor?.full_name ?? 'System'}</span>{' '}
              {row.direction === 'inbound' ? 'heard from' : 'contacted'}{' '}
              <span className="font-medium">{row.application.candidate.full_name}</span>
            </p>
            <span className="inline-flex h-5 items-center gap-1 rounded-pill bg-surface-2 px-2 text-caption text-ink-muted">
              <Icon aria-hidden="true" className="size-3" />
              {row.channel_label}
              <Direction aria-hidden="true" className="size-3 opacity-70" />
            </span>
            <span
              className={cn(
                'inline-flex h-5 items-center rounded-pill px-2 text-caption font-medium',
                OUTCOME_CLASS[row.outcome] ?? 'bg-info-soft text-info',
              )}
            >
              {row.outcome_label}
            </span>
            <span
              className="ml-auto text-caption text-ink-subtle"
              title={formatDateTime(row.occurred_at)}
            >
              {formatRelative(row.occurred_at)}
            </span>
          </div>
          <p className="mt-1 text-small font-medium text-ink">{row.summary}</p>
          {row.notes && (
            <p className="mt-1 text-small whitespace-pre-line text-ink-muted">{row.notes}</p>
          )}
          {row.next_action && (
            <p className="mt-2 text-small text-ink-muted">
              Next: <span className="text-ink">{row.next_action}</span>
              {row.next_action_at && (
                <span className={cn('ml-1', overdue ? 'text-warning' : 'text-ink-subtle')}>
                  · due {formatDateTime(row.next_action_at)}
                  {overdue && (
                    <span className="ml-1.5 inline-flex h-4 items-center rounded-pill bg-warning-soft px-1.5 align-middle text-caption font-medium text-warning">
                      Overdue
                    </span>
                  )}
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </li>
  )
}

/** plan.md 9.10 Communications tab: the contact log with "Log contact" on top. */
export function CommunicationsTab({
  application,
  actions,
}: {
  application: ApplicationDetail
  actions: ApplicationActionsHandle
}) {
  const list = useCommunications({ application: application.id, page_size: 100 })
  const canLog = application.permissions.can_transition && isActive(application.status)
  const rows = list.data?.results ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-small text-ink-muted">
          {list.data
            ? `${list.data.count} ${list.data.count === 1 ? 'contact' : 'contacts'} logged`
            : ''}
        </p>
        {canLog && (
          <Button type="button" onClick={() => actions.logContact(toTarget(application))}>
            <PhoneCallIcon data-icon="inline-start" aria-hidden="true" />
            Log contact
          </Button>
        )}
      </div>
      {list.isPending ? (
        <div className="space-y-4">
          <SkeletonCard lines={2} avatar />
          <SkeletonCard lines={2} avatar />
        </div>
      ) : list.isError ? (
        <ErrorState
          title="Couldn't load communications"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MessageSquareDashedIcon}
          title="No contact logged yet"
          description="Calls, emails and messages with the candidate appear here and on the timeline."
          action={
            canLog ? (
              <Button type="button" onClick={() => actions.logContact(toTarget(application))}>
                Log contact
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <CommunicationRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  )
}
