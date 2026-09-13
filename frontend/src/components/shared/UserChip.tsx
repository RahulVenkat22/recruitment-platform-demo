import { Link } from 'react-router'
import { Avatar } from '@/components/shared/Avatar'
import type { AvatarSize } from '@/components/shared/avatar-utils'
import { cn } from '@/lib/utils'
import type { Person } from '@/types/domain'

export interface UserChipProps {
  user: Person
  size?: 'sm' | 'md'
  /** Shows the designation after the name ("Rahul • HR Manager"). */
  showRole?: boolean
  /** Explicit secondary text, e.g. the role in recruitment; wins over `showRole`. */
  secondary?: string | null
  /** `stacked` puts the secondary text under the name (sidebar, pickers). */
  layout?: 'inline' | 'stacked'
  /** Wraps the chip in a router link when set. */
  to?: string
  className?: string
}

const AVATAR_FOR_SIZE: Record<NonNullable<UserChipProps['size']>, AvatarSize> = {
  sm: 'sm',
  md: 'md',
}

/** `[Avatar] Name • Secondary`, used in tables, timelines and participant lists. */
export function UserChip({
  user,
  size = 'sm',
  showRole = false,
  secondary,
  layout = 'inline',
  to,
  className,
}: UserChipProps) {
  const detail = secondary ?? (showRole ? user.designation : null)

  const body = (
    <span
      data-slot="user-chip"
      className={cn('inline-flex min-w-0 max-w-full items-center gap-2', className)}
    >
      <Avatar name={user.name} src={user.avatar_url} size={AVATAR_FOR_SIZE[size]} />
      {layout === 'stacked' ? (
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate text-[13px] font-medium text-ink">{user.name}</span>
          {detail && <span className="block truncate text-caption text-ink-subtle">{detail}</span>}
        </span>
      ) : (
        <span className="min-w-0 truncate text-small">
          <span className="font-medium text-ink">{user.name}</span>
          {detail && (
            <span className="text-ink-subtle">
              {' • '}
              {detail}
            </span>
          )}
        </span>
      )}
    </span>
  )

  if (!to) return body
  return (
    <Link
      to={to}
      className="inline-flex min-w-0 max-w-full rounded-control hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {body}
    </Link>
  )
}
