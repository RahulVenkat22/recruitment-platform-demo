import { focusRovingSibling, rovingIndex } from '@/lib/keyboard'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  key: T
  label: string
  /** Text colour when selected (e.g. the recommendation tone). */
  tone?: string
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[]
  value: T | ''
  onChange: (next: T) => void
  'aria-label': string
  size?: 'sm' | 'md'
  className?: string
}

/** A radio group drawn as joined buttons (direction, mode, recommendation). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex w-full rounded-control border border-line bg-surface-2 p-0.5',
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = option.key === value
        // Roving tabindex: one tab stop per group, arrows move between options.
        const tabStop = checked || (value === '' && index === 0)
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={tabStop ? 0 : -1}
            onClick={() => onChange(option.key)}
            onKeyDown={(event) => {
              const next = rovingIndex(event.key, index, options.length)
              if (next === null) return
              event.preventDefault()
              onChange(options[next].key)
              focusRovingSibling(event.currentTarget.parentElement, next)
            }}
            className={cn(
              'flex-1 rounded-[6px] px-2 font-medium whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-7 text-caption' : 'h-8 text-small',
              checked
                ? 'bg-surface text-ink shadow-card'
                : 'text-ink-muted hover:text-ink focus-visible:text-ink',
            )}
            style={checked && option.tone ? { color: option.tone } : undefined}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
