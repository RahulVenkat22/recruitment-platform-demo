import { Avatar } from '@/components/shared/Avatar'
import { AVATAR_SIZES, type AvatarSize } from '@/components/shared/avatar-utils'
import { UserChip } from '@/components/shared/UserChip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Person } from '@/types/domain'

export interface AvatarGroupProps {
  people: Person[]
  /** Avatars shown before the `+N` pill. */
  max?: number
  size?: AvatarSize
  className?: string
}

/**
 * Overlapping avatars with a surface ring, a `+N` pill for the overflow, a
 * "Name • Designation" tooltip per avatar and a popover listing everyone on click.
 */
export function AvatarGroup({ people, max = 4, size = 'md', className }: AvatarGroupProps) {
  if (people.length === 0) return null

  const visible = people.slice(0, Math.max(0, max))
  const overflow = people.length - visible.length
  const px = AVATAR_SIZES[size]
  const overlap = -Math.round(px / 4)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${people.length} ${people.length === 1 ? 'person' : 'people'}`}
          data-slot="avatar-group"
          className={cn(
            'inline-flex items-center rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            className,
          )}
        >
          {visible.map((person, index) => (
            <Tooltip key={person.id}>
              <TooltipTrigger asChild>
                <span
                  className="inline-flex rounded-full"
                  style={{ marginLeft: index === 0 ? 0 : overlap, zIndex: visible.length - index }}
                >
                  <Avatar name={person.name} src={person.avatar_url} size={size} ring />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                {person.name}
                {person.designation ? ` • ${person.designation}` : ''}
              </TooltipContent>
            </Tooltip>
          ))}
          {overflow > 0 && (
            <span
              data-slot="avatar-group-overflow"
              style={{ marginLeft: overlap, height: px, minWidth: px }}
              className="inline-flex items-center justify-center rounded-pill bg-surface-2 px-1.5 text-caption text-ink-muted ring-2 ring-surface tabular-nums"
            >
              +{overflow}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-1 p-2">
        <p className="px-1.5 pt-0.5 pb-1 text-caption text-ink-subtle">
          {people.length} {people.length === 1 ? 'person' : 'people'}
        </p>
        <ul className="max-h-72 space-y-0.5 overflow-y-auto">
          {people.map((person) => (
            <li key={person.id} className="rounded-control px-1.5 py-1 hover:bg-surface-2">
              <UserChip user={person} size="md" layout="stacked" showRole />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
