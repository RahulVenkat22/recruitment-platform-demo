import { Avatar } from '@/components/shared/Avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { UserRow } from '@/types/domain'

export interface UserSelectProps {
  id?: string
  value: string
  onChange: (userId: string) => void
  options: readonly UserRow[]
  placeholder?: string
  disabled?: boolean
  'aria-label'?: string
  className?: string
}

/** A single-user picker rendered as avatar + name + designation (interviewer, buddy, HR contact). */
export function UserSelect({
  id,
  value,
  onChange,
  options,
  placeholder = 'Choose a person',
  disabled,
  'aria-label': ariaLabel,
  className,
}: UserSelectProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} aria-label={ariaLabel} className={className ?? 'w-full'}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((user) => (
          <SelectItem key={user.id} value={user.id}>
            <span className="flex items-center gap-2">
              <Avatar name={user.full_name} src={user.avatar_url} size="xs" />
              <span className="font-medium text-ink">{user.full_name}</span>
              <span className="text-caption text-ink-subtle">{user.designation}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
