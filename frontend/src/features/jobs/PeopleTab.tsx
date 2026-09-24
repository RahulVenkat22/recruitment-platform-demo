import { PlusIcon, UsersIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ActionMenu, type RowAction } from '@/components/shared/ActionMenu'
import { Avatar } from '@/components/shared/Avatar'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { describeError } from '@/lib/errors'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { Button } from '@/components/ui/button'
import { AddPeopleDialog } from '@/features/jobs/AddPeopleDialog'
import { useParticipants, useRemoveParticipant, useUpdateParticipant } from '@/features/jobs/api'
import { useEnumOptions } from '@/lib/enums'
import type { JobDetail, Participant, ParticipantRole } from '@/types/domain'

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** plan.md 9.6 People Involved tab. */
export function PeopleTab({ job }: { job: JobDetail }) {
  const participants = useParticipants(job.id)
  const updateRole = useUpdateParticipant(job.id)
  const remove = useRemoveParticipant(job.id)
  const roles = useEnumOptions('participant_role')
  const [adding, setAdding] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<Participant | null>(null)
  const canManage = job.permissions.can_manage_participants

  async function changeRole(participant: Participant, role: ParticipantRole) {
    try {
      await updateRole.mutateAsync({ participantId: participant.id, role })
      toast.success(
        `${participant.user.full_name} is now ${roles.find((r) => r.key === role)?.label ?? role}`,
      )
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  async function removeParticipant(participant: Participant) {
    try {
      await remove.mutateAsync(participant.id)
      toast.success(`Removed ${participant.user.full_name} from the recruitment`)
    } catch (error) {
      toast.error(describeError(error))
      throw error
    }
  }

  function itemsFor(participant: Participant): RowAction[] {
    if (!canManage || participant.user.id === job.created_by.id) return []
    const roleItems: RowAction[] = roles
      .filter((role) => role.key !== 'owner' && role.key !== participant.role_in_recruitment)
      .map((role, index) => ({
        key: `role-${role.key}`,
        label: `Make ${role.label}`,
        groupLabel: index === 0 ? 'Change role' : undefined,
        onSelect: () => void changeRole(participant, role.key as ParticipantRole),
      }))
    return [
      ...roleItems,
      {
        key: 'remove',
        label: 'Remove from recruitment',
        destructive: true,
        separatorBefore: true,
        onSelect: () => setPendingRemove(participant),
      },
    ]
  }

  const rows = participants.data ?? job.participants

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-h3 text-ink">People Involved in the Recruitment</h2>
          <p className="text-small text-ink-muted">
            {plural(rows.length, 'person').replace('persons', 'people')} on this role.
          </p>
        </div>
        {canManage && (
          <Button type="button" variant="outline" onClick={() => setAdding(true)}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            Add people
          </Button>
        )}
      </div>

      {participants.isError ? (
        <ErrorState
          variant="inline"
          title="Couldn't refresh the people list"
          error={participants.error}
          onRetry={() => void participants.refetch()}
        />
      ) : null}

      {participants.isPending && rows.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <SkeletonCard key={index} avatar lines={0} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="Nobody is involved yet"
          description="Add recruiters, hiring managers and interviewers so they can see and work this role."
          action={
            canManage ? (
              <Button type="button" onClick={() => setAdding(true)}>
                Add people
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface shadow-card">
          {rows.map((participant) => {
            const isCreator = participant.user.id === job.created_by.id
            return (
              <li
                key={participant.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
              >
                <Avatar
                  name={participant.user.full_name}
                  src={participant.user.avatar_url}
                  size="lg"
                />
                <div className="min-w-0 grow basis-40">
                  <p className="truncate text-[15px] font-medium text-ink">
                    {participant.user.full_name}
                    {isCreator && (
                      <span className="ml-2 text-caption font-normal text-ink-subtle">Creator</span>
                    )}
                  </p>
                  <p className="truncate text-small text-ink-muted">
                    {participant.user.designation} • {participant.user.department}
                  </p>
                  <p className="mt-0.5 text-caption text-ink-subtle tabular-nums">
                    {plural(participant.interview_count, 'interview')} •{' '}
                    {plural(participant.activity_count, 'activity').replace(
                      'activitys',
                      'activities',
                    )}
                  </p>
                </div>
                {/* Role pill and menu drop under the name on phones (pl-14 lines them up with the text). */}
                <div className="flex shrink-0 items-center gap-2 max-sm:w-full max-sm:pl-14">
                  <span className="inline-flex h-6 shrink-0 items-center rounded-pill bg-primary-soft px-2.5 text-caption font-medium text-primary">
                    {participant.role_label}
                  </span>
                  <ActionMenu
                    items={itemsFor(participant)}
                    label={`Actions for ${participant.user.full_name}`}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <AddPeopleDialog
        open={adding}
        onOpenChange={setAdding}
        job={job}
        existingUserIds={rows.map((participant) => participant.user.id)}
      />
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={pendingRemove ? `Remove ${pendingRemove.user.full_name}?` : 'Remove person?'}
        description="They will no longer see this job description unless they are an HR admin. Their past actions stay in the activity feed."
        confirmLabel="Remove"
        destructive
        onConfirm={() => (pendingRemove ? removeParticipant(pendingRemove) : undefined)}
      />
    </div>
  )
}
