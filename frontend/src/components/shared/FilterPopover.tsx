import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface FilterPopoverOption {
  key: string
  label: string
  count?: number
}

export interface FilterPopoverProps {
  label: string
  options: readonly FilterPopoverOption[]
  selected: readonly string[]
  onChange: (selected: string[]) => void
  /** Show a search box above the list (for long option lists such as locations). */
  searchable?: boolean
  emptyLabel?: string
  className?: string
}

/** A toolbar filter: outline button with a count, popover with a checkbox list and counts (plan.md 9.4). */
export function FilterPopover({
  label,
  options,
  selected,
  onChange,
  searchable = false,
  emptyLabel = 'No options',
  className,
}: FilterPopoverProps) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const selectedSet = new Set(selected)
  const active = selected.length > 0
  const visible = query
    ? options.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()))
    : options

  function toggle(key: string) {
    if (selectedSet.has(key)) onChange(selected.filter((item) => item !== key))
    else onChange([...selected, key])
  }

  return (
    <Popover onOpenChange={(open) => !open && setQuery('')}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-active={active || undefined}
          className={cn(
            'gap-1.5 bg-surface',
            active && 'border-primary/40 bg-primary-soft text-primary hover:bg-primary-soft',
            className,
          )}
        >
          {label}
          {active && (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-primary px-1 text-[10px] font-medium text-white tabular-nums">
              {selected.length}
            </span>
          )}
          <ChevronDownIcon aria-hidden="true" className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {searchable && (
          <div className="relative mb-2">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-ink-subtle"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
              aria-controls={listId}
              className="h-8 w-full rounded-control border border-line bg-surface pr-2 pl-7 text-small outline-none focus-visible:border-primary"
            />
          </div>
        )}
        <ul
          id={listId}
          role="group"
          aria-label={label}
          className="max-h-64 space-y-0.5 overflow-y-auto"
        >
          {visible.length === 0 && (
            <li className="px-2 py-3 text-center text-small text-ink-subtle">{emptyLabel}</li>
          )}
          {visible.map((option) => {
            const checked = selectedSet.has(option.key)
            return (
              <li key={option.key}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(option.key)}
                  className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-small hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                      checked
                        ? 'border-primary bg-primary text-white'
                        : 'border-line-strong bg-surface',
                    )}
                  >
                    {checked && <CheckIcon className="size-3" strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">{option.label}</span>
                  {option.count !== undefined && (
                    <span className="text-caption text-ink-subtle tabular-nums">
                      {option.count}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        {active && (
          <div className="mt-2 border-t border-line pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-ink-muted"
              onClick={() => onChange([])}
            >
              <XIcon data-icon="inline-start" aria-hidden="true" />
              Clear {label.toLowerCase()}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
