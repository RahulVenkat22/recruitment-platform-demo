import { LayoutGridIcon, ListIcon } from 'lucide-react'
import { focusRovingSibling, rovingIndex } from '@/lib/keyboard'
import { cn } from '@/lib/utils'

export type ListView = 'table' | 'cards'

const OPTIONS = [
  { key: 'table', label: 'Table', Icon: ListIcon },
  { key: 'cards', label: 'Cards', Icon: LayoutGridIcon },
] as const

export interface ViewToggleProps {
  view: ListView
  onChange: (view: ListView) => void
  className?: string
}

/**
 * Table / Cards switch drawn as a radio group (plan.md 9.4). Roving tabindex:
 * the group is one tab stop and the arrow keys move between the two views.
 */
export function ViewToggle({ view, onChange, className }: ViewToggleProps) {
  const anyChecked = OPTIONS.some((option) => option.key === view)
  return (
    <div
      role="radiogroup"
      aria-label="View"
      className={cn(
        'inline-flex h-8 shrink-0 items-center rounded-control border border-line bg-surface p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ key, label, Icon }, index) => {
        const checked = view === key
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={`${label} view`}
            tabIndex={checked || (!anyChecked && index === 0) ? 0 : -1}
            onClick={() => onChange(key)}
            onKeyDown={(event) => {
              const next = rovingIndex(event.key, index, OPTIONS.length)
              if (next === null) return
              event.preventDefault()
              onChange(OPTIONS[next].key)
              focusRovingSibling(event.currentTarget.parentElement, next)
            }}
            className={cn(
              'relative inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-small transition-colors duration-150 ease-brand',
              checked ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            <span className="max-sm:sr-only">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
