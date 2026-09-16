import { SearchIcon, XIcon } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Avatar } from '@/components/shared/Avatar'
import { AvatarGroup } from '@/components/shared/AvatarGroup'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { defaultRoleFor } from '@/components/shared/people-picker-utils'
import { useEnumOptions } from '@/lib/enums'
import { useUsersDirectory } from '@/lib/users'
import { cn } from '@/lib/utils'
import type { ParticipantRole, Person, UserRow } from '@/types/domain'

export interface PeoplePickerValue {
  user_id: string
  role_in_recruitment: ParticipantRole
}

export interface PeoplePickerProps {
  value: PeoplePickerValue[]
  onChange: (next: PeoplePickerValue[]) => void
  /** The creator: always listed first as Owner, role locked, cannot be removed. */
  lockedUserId?: string
  /** Users that cannot be picked (e.g. already on the JD when adding from the People tab). */
  excludeUserIds?: readonly string[]
  /** Hide the selected list and show only an AvatarGroup summary. */
  collapsed?: boolean
  placeholder?: string
  disabled?: boolean
  id?: string
  'aria-invalid'?: boolean
  className?: string
}

function toPerson(user: UserRow): Person {
  return {
    id: user.id,
    name: user.full_name,
    avatar_url: user.avatar_url,
    designation: user.designation,
  }
}

/**
 * The "People Involved in the Recruitment" control: a command-palette search over
 * the directory grouped by department, and a selected list with a role select
 * per person. The creator stays pinned as Owner.
 */
export function PeoplePicker({
  value,
  onChange,
  lockedUserId,
  excludeUserIds = [],
  collapsed = false,
  placeholder = 'Search employees…',
  disabled = false,
  id,
  'aria-invalid': ariaInvalid,
  className,
}: PeoplePickerProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const directory = useUsersDirectory()
  const roles = useEnumOptions('participant_role')
  const users = useMemo(() => directory.data ?? [], [directory.data])
  const byId = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const selectedIds = useMemo(() => new Set(value.map((entry) => entry.user_id)), [value])
  const excluded = useMemo(() => new Set(excludeUserIds), [excludeUserIds])

  const ordered = useMemo(() => {
    const rows = [...value]
    if (lockedUserId) {
      const index = rows.findIndex((entry) => entry.user_id === lockedUserId)
      if (index > 0) rows.unshift(...rows.splice(index, 1))
    }
    return rows
  }, [value, lockedUserId])

  const groups = useMemo(() => {
    const map = new Map<string, UserRow[]>()
    for (const user of users) {
      if (!user.is_active || selectedIds.has(user.id) || excluded.has(user.id)) continue
      const list = map.get(user.department) ?? []
      list.push(user)
      map.set(user.department, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [users, selectedIds, excluded])

  function add(user: UserRow) {
    onChange([...value, { user_id: user.id, role_in_recruitment: defaultRoleFor(user) }])
    setOpen(false)
  }

  function setRole(userId: string, role: ParticipantRole) {
    onChange(
      value.map((entry) =>
        entry.user_id === userId ? { ...entry, role_in_recruitment: role } : entry,
      ),
    )
  }

  function remove(userId: string) {
    onChange(value.filter((entry) => entry.user_id !== userId))
  }

  const people: Person[] = ordered
    .map((entry) => byId.get(entry.user_id))
    .filter((user): user is UserRow => Boolean(user))
    .map(toPerson)

  if (collapsed) {
    return people.length > 0 ? (
      <AvatarGroup people={people} size="sm" className={className} />
    ) : (
      <span className="text-small text-ink-subtle">Nobody yet</span>
    )
  }

  return (
    <div data-slot="people-picker" className={cn('space-y-3', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            id={id}
            disabled={disabled}
            aria-invalid={ariaInvalid}
            aria-haspopup="listbox"
            aria-expanded={open}
            className={cn(
              'flex h-9 w-full items-center gap-2 rounded-control border border-line bg-surface px-3 text-left text-small text-ink-subtle',
              'transition-colors duration-150 ease-brand hover:border-line-strong focus-visible:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              'aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-60',
            )}
          >
            <SearchIcon aria-hidden="true" className="size-4 shrink-0" />
            <span className="flex-1 truncate">{placeholder}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={16}
          className="w-(--radix-popover-trigger-width) min-w-80 p-0"
          // Focus moves in and out without the browser's scroll-into-view, so opening
          // or closing the picker never shifts the page (Enhancement.md 4, issue 2).
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            triggerRef.current?.focus({ preventScroll: true })
          }}
        >
          <Command loop>
            <CommandInput ref={inputRef} placeholder="Search by name, title or department" />
            <CommandList className="max-h-72 overscroll-contain">
              <CommandEmpty>
                {directory.isPending
                  ? 'Loading people…'
                  : directory.isError
                    ? "Couldn't load the directory."
                    : 'No one matches.'}
              </CommandEmpty>
              {groups.map(([department, members]) => (
                <CommandGroup key={department} heading={department}>
                  {members.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={`${user.full_name} ${user.designation} ${user.department} ${user.email}`}
                      onSelect={() => add(user)}
                      className="gap-2.5"
                    >
                      <Avatar name={user.full_name} src={user.avatar_url} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {user.full_name}
                        </span>
                        <span className="block truncate text-caption text-ink-subtle">
                          {user.designation}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {ordered.length > 0 && (
        <div>
          <p className="mb-1.5 text-caption text-ink-subtle uppercase">Selected</p>
          <ul className="divide-y divide-line rounded-card border border-line bg-surface">
            {ordered.map((entry) => {
              const user = byId.get(entry.user_id)
              const locked = entry.user_id === lockedUserId
              const name = user?.full_name ?? 'Unknown user'
              return (
                <li
                  key={entry.user_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2"
                >
                  <Avatar name={name} src={user?.avatar_url} size="md" />
                  <span className="min-w-0 flex-1 basis-32">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {name}
                      {locked && <span className="ml-1.5 text-caption text-ink-subtle">(you)</span>}
                    </span>
                    <span className="block truncate text-caption text-ink-subtle">
                      {user ? `${user.designation} • ${user.department}` : entry.user_id}
                    </span>
                  </span>
                  {locked ? (
                    <span className="inline-flex h-7 items-center rounded-pill bg-primary-soft px-2.5 text-caption font-medium text-primary">
                      Owner
                    </span>
                  ) : (
                    <Select
                      value={entry.role_in_recruitment}
                      onValueChange={(role) => setRole(entry.user_id, role as ParticipantRole)}
                      disabled={disabled}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label={`Role for ${name}`}
                        className="w-40 max-sm:w-36"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        {roles
                          .filter((role) => role.key !== 'owner')
                          .map((role) => (
                            <SelectItem key={role.key} value={role.key}>
                              {role.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!locked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${name}`}
                      disabled={disabled}
                      onClick={() => remove(entry.user_id)}
                    >
                      <XIcon aria-hidden="true" />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
