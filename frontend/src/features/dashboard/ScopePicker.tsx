import { CheckIcon, ChevronDownIcon, UsersIcon, XIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Avatar } from '@/components/shared/Avatar'
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
import { useEnumOptions } from '@/lib/enums'
import { useUsersDirectory } from '@/lib/users'
import { cn } from '@/lib/utils'
import type { UserRow } from '@/types/domain'

export interface ScopePickerProps {
  /** The focused people's ids; empty means everyone. */
  value: readonly string[]
  /** Adds or removes one person. */
  onToggle: (userId: string) => void
  /** Back to everyone. */
  onClear: () => void
  className?: string
}

/** The roles in the order a manager scans them. */
const ROLE_ORDER = ['hr_admin', 'hr', 'interviewer', 'employee']

/**
 * "Whose dashboard": everyone the viewer may see, or the job descriptions of any
 * number of people. A command-palette search over the directory, grouped by
 * role; people toggle in and out and the list stays open while picking.
 */
export function ScopePicker({ value, onToggle, onClear, className }: ScopePickerProps) {
  const [open, setOpen] = useState(false)
  const directory = useUsersDirectory()
  const roles = useEnumOptions('user_role')
  const users = useMemo(() => directory.data ?? [], [directory.data])
  const selected = value.flatMap((id) => users.find((user) => user.id === id) ?? [])
  const label =
    selected.length === 0
      ? 'Everyone'
      : selected.length === 1
        ? selected[0].full_name
        : `${selected[0].full_name} +${selected.length - 1}`

  const groups = useMemo(() => {
    const byRole = new Map<string, UserRow[]>()
    for (const user of users) {
      if (!user.is_active) continue
      const list = byRole.get(user.role) ?? []
      list.push(user)
      byRole.set(user.role, list)
    }
    return ROLE_ORDER.filter((role) => byRole.has(role)).map((role) => ({
      role,
      label: roles.find((option) => option.key === role)?.label ?? role,
      users: byRole.get(role) ?? [],
    }))
  }, [users, roles])

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={
              selected.length > 0 ? `Showing ${label}. Change people` : 'Choose whose data to show'
            }
            data-active={selected.length > 0 ? true : undefined}
            className={cn(
              'max-w-64 gap-2 bg-surface pl-1.5',
              selected.length > 0 &&
                'border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft',
            )}
          >
            {selected.length > 0 ? (
              <Avatar name={selected[0].full_name} src={selected[0].avatar_url} size="xs" />
            ) : (
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
                <UsersIcon aria-hidden="true" className="size-3" />
              </span>
            )}
            <span className="truncate">{label}</span>
            <ChevronDownIcon aria-hidden="true" className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-0">
          <Command>
            <CommandInput placeholder="Search people…" />
            <CommandList className="max-h-80">
              <CommandEmpty>
                {directory.isPending ? 'Loading people…' : 'No one matches that name.'}
              </CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="everyone"
                  onSelect={() => {
                    onClear()
                    setOpen(false)
                  }}
                  className="gap-2.5"
                >
                  <span className="inline-flex size-6 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
                    <UsersIcon aria-hidden="true" className="size-3.5" />
                  </span>
                  <span className="flex-1 font-medium text-ink">Everyone</span>
                  {value.length === 0 && (
                    <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                  )}
                </CommandItem>
              </CommandGroup>
              {groups.map((group) => (
                <CommandGroup key={group.role} heading={group.label}>
                  {group.users.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={`${user.full_name} ${user.designation} ${user.email}`}
                      onSelect={() => onToggle(user.id)}
                      aria-selected={value.includes(user.id)}
                      className="gap-2.5"
                    >
                      <Avatar name={user.full_name} src={user.avatar_url} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">
                          {user.full_name}
                        </span>
                        <span className="block truncate text-caption text-ink-subtle">
                          {user.designation}
                        </span>
                      </span>
                      {value.includes(user.id) && (
                        <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            <p className="border-t border-line px-3 py-2 text-caption text-ink-subtle">
              Pick as many people as you like.
            </p>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Show everyone"
          onClick={onClear}
          className="text-ink-subtle hover:text-ink"
        >
          <XIcon aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}
