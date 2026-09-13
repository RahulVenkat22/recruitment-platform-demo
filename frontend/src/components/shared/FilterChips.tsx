import { CheckIcon } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export interface FilterChipOption {
  key: string
  label: string
  /** Dot and checked-text colour (hex from the enums catalogue); defaults to the primary colour. */
  color?: string
  /** Soft fill when checked; defaults to primary-soft. */
  bg?: string
  count?: number
}

export interface FilterChipsProps {
  options: readonly FilterChipOption[]
  selected: readonly string[]
  onChange: (selected: string[]) => void
  /** Adds "All" and "None" text buttons after the chips. */
  allowAllNone?: boolean
  'aria-label'?: string
  className?: string
}

/**
 * Toggle chips with a coloured dot and count (plan.md 8.4). Each chip is a
 * checkbox button, so space and enter toggle it and screen readers announce
 * the state. The checked fill uses the option's soft colour.
 */
export function FilterChips({
  options,
  selected,
  onChange,
  allowAllNone = false,
  'aria-label': ariaLabel = 'Filters',
  className,
}: FilterChipsProps) {
  const selectedSet = new Set(selected)

  function toggle(key: string) {
    if (selectedSet.has(key)) onChange(selected.filter((item) => item !== key))
    else onChange([...selected, key])
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="filter-chips"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {options.map((option) => {
        const checked = selectedSet.has(option.key)
        const style = {
          '--chip-color': option.color ?? 'var(--color-primary)',
          '--chip-bg': option.bg ?? 'var(--color-primary-soft)',
        } as CSSProperties
        return (
          <button
            key={option.key}
            type="button"
            role="checkbox"
            aria-checked={checked}
            data-key={option.key}
            data-state={checked ? 'checked' : 'unchecked'}
            style={style}
            onClick={() => toggle(option.key)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded-pill border px-2.5 text-small select-none',
              'transition-[background-color,border-color,color] duration-250 ease-brand',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              checked
                ? 'border-transparent bg-(--chip-bg) text-(--chip-color)'
                : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink',
            )}
          >
            {checked ? (
              <CheckIcon aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full bg-(--chip-color)"
              />
            )}
            <span className="font-medium">{option.label}</span>
            {option.count !== undefined && (
              <span
                className={cn(
                  'text-caption tabular-nums',
                  checked ? 'opacity-80' : 'text-ink-subtle',
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
      {allowAllNone && (
        <span className="ml-auto inline-flex items-center gap-1 text-small">
          <button
            type="button"
            onClick={() => onChange(options.map((option) => option.key))}
            className="rounded-control px-1.5 py-0.5 font-medium text-primary hover:bg-primary-soft"
          >
            All
          </button>
          <span aria-hidden="true" className="text-ink-subtle">
            ·
          </span>
          <button
            type="button"
            onClick={() => onChange([])}
            className="rounded-control px-1.5 py-0.5 font-medium text-primary hover:bg-primary-soft"
          >
            None
          </button>
        </span>
      )}
    </div>
  )
}
