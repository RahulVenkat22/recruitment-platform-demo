import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboboxProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: readonly string[]
  placeholder?: string
  /** Shown in place of the empty text while `options` are on their way. */
  loading?: boolean
  emptyText?: string
  disabled?: boolean
  'aria-invalid'?: boolean
  className?: string
}

/**
 * One choice from a long list, searched as you type. The current value is shown
 * even when the list does not contain it (an older record, an uploaded file).
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = 'Choose…',
  loading = false,
  emptyText = 'Nothing matches.',
  disabled,
  'aria-invalid': invalid,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn(
            'w-full justify-between bg-transparent px-2.5 font-normal',
            !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronDownIcon aria-hidden="true" className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList className="max-h-64">
            <CommandEmpty>{loading ? 'Loading…' : emptyText}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option}
                value={option}
                data-checked={option === value || undefined}
                onSelect={() => {
                  onChange(option)
                  setOpen(false)
                }}
              >
                {option}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
