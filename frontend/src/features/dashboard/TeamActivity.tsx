import { UsersIcon } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { StackedBar } from '@/features/dashboard/charts/StackedBar'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import { TEAM_GROUPS, teamSegments } from '@/features/dashboard/team-utils'
import { cn } from '@/lib/utils'
import type { TeamMember } from '@/types/domain'

/**
 * Who did what: one row per person with their actions across the window split by
 * kind. A row is a button that adds that person to the dashboard's focus; focused
 * rows are highlighted and clicking one again takes the person out.
 */
export function TeamActivity({
  members,
  focused,
  onFocus,
}: {
  members: readonly TeamMember[]
  focused: readonly string[]
  onFocus: (userId: string) => void
}) {
  const max = Math.max(1, ...members.map((member) => member.total))

  if (members.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={UsersIcon}
        title="No activity in this window"
        description="Actions on the job descriptions you can see show up here, by person."
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ul className="space-y-1" aria-label="Team activity">
        {members.map((member) => {
          const active = focused.includes(member.user.id)
          return (
            <li key={member.user.id}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onFocus(member.user.id)}
                title={
                  active
                    ? `Take ${member.user.full_name} out of the focus`
                    : `Focus on ${member.user.full_name}`
                }
                className={cn(
                  'flex w-full flex-col gap-1.5 rounded-control px-2 py-2 text-left transition-colors duration-150 ease-brand hover:bg-surface-2',
                  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                  active && 'bg-primary-soft hover:bg-primary-soft',
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Avatar name={member.user.full_name} src={member.user.avatar_url} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium text-ink">
                      {member.user.full_name}
                    </span>
                    <span className="block truncate text-caption text-ink-subtle">
                      {member.user.designation}
                      {member.roles > 0 &&
                        ` · ${member.roles} ${member.roles === 1 ? 'role' : 'roles'}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-small text-ink tabular-nums">
                    <span className="font-medium">{formatCount(member.total)}</span>
                    <span className="text-ink-subtle"> actions</span>
                  </span>
                </span>
                <StackedBar
                  segments={teamSegments(member)}
                  max={max}
                  title={member.user.full_name}
                  footer={`${member.roles} ${member.roles === 1 ? 'role' : 'roles'} in the window`}
                />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3">
        {TEAM_GROUPS.map((group) => (
          <span
            key={group.key}
            className="inline-flex items-center gap-1.5 text-caption text-ink-muted"
          >
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[3px]"
              style={{ background: group.color }}
            />
            {group.label}
          </span>
        ))}
        <span className="ml-auto text-caption text-ink-subtle">Click people to focus on them</span>
      </div>
    </div>
  )
}
