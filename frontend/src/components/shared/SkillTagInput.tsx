import { XIcon } from 'lucide-react'
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useSkillSuggestions } from '@/features/jobs/api'
import { useDebounce } from '@/lib/hooks'
import { cn } from '@/lib/utils'

export interface SkillTagInputProps {
  value: string[]
  onChange: (next: string[]) => void
  /** Skills already used elsewhere (a required skill cannot also be preferred). */
  exclude?: readonly string[]
  placeholder?: string
  id?: string
  disabled?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  className?: string
}

const SEPARATORS = new Set([',', ';'])

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Tag input for JD skills (plan.md 9.5): chips, Enter or comma to add, Backspace
 * to pop, ArrowUp/Down through suggestions from `GET /skills/`. The API applies
 * the canonical normaliser on save; this only de-duplicates by lowercase text.
 */
export function SkillTagInput({
  value,
  onChange,
  exclude = [],
  placeholder = 'Add a skill and press Enter',
  id,
  disabled = false,
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy,
  className,
}: SkillTagInputProps) {
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const query = useDebounce(draft.trim(), 200)
  const suggestions = useSkillSuggestions(query, { enabled: open })

  const taken = useMemo(() => new Set([...value, ...exclude].map(norm)), [value, exclude])
  const options = useMemo(() => {
    const rows = (suggestions.data ?? []).filter(
      (row) => !taken.has(norm(row.display_name)) && !taken.has(row.key),
    )
    const typed = draft.trim()
    const hasTyped =
      typed &&
      !taken.has(norm(typed)) &&
      !rows.some((row) => norm(row.display_name) === norm(typed))
    return hasTyped ? [{ key: `__new__${typed}`, display_name: typed, count: 0 }, ...rows] : rows
  }, [suggestions.data, taken, draft])

  // Suggestions arrive asynchronously, so clamp instead of resetting in an effect.
  const activeIndex = Math.min(highlight, Math.max(0, options.length - 1))

  function add(label: string) {
    const clean = label.trim().replace(/\s+/g, ' ')
    if (!clean || taken.has(norm(clean))) {
      setDraft('')
      return
    }
    onChange([...value, clean])
    setDraft('')
    setOpen(true)
  }

  function remove(index: number) {
    onChange(value.filter((_, position) => position !== index))
    inputRef.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || SEPARATORS.has(event.key)) {
      event.preventDefault()
      const pick = open ? options[activeIndex] : undefined
      add(pick ? pick.display_name : draft)
      return
    }
    if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      event.preventDefault()
      remove(value.length - 1)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setHighlight(Math.min(activeIndex + 1, Math.max(0, options.length - 1)))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight(Math.max(activeIndex - 1, 0))
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  const showList = open && !disabled && (options.length > 0 || suggestions.isPending)

  return (
    <div
      data-slot="skill-tag-input"
      className={cn('relative', className)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          'flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-control border border-line bg-surface px-2 py-1.5',
          'transition-colors duration-150 ease-brand focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/20',
          ariaInvalid && 'border-danger',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {value.map((skill, index) => (
          <span
            key={`${skill}-${index}`}
            className="inline-flex h-6 items-center gap-1 rounded-pill bg-surface-2 pr-1 pl-2.5 text-[13px] text-ink"
          >
            {skill}
            <button
              type="button"
              aria-label={`Remove ${skill}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation()
                remove(index)
              }}
              className="inline-flex size-4 items-center justify-center rounded-full text-ink-subtle hover:bg-surface-3 hover:text-ink"
            >
              <XIcon aria-hidden="true" className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={ariaInvalid}
          aria-describedby={describedBy}
          disabled={disabled}
          value={draft}
          placeholder={value.length === 0 ? placeholder : ''}
          onChange={(event) => {
            setDraft(event.target.value)
            setHighlight(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-32 flex-1 bg-transparent text-small outline-none placeholder:text-ink-subtle"
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-popover"
        >
          {options.length === 0 && (
            <li className="px-2 py-2 text-small text-ink-subtle">Looking up skills…</li>
          )}
          {options.map((option, index) => {
            const isNew = option.key.startsWith('__new__')
            return (
              <li
                key={option.key}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => add(option.display_name)}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-control px-2 py-1.5 text-small',
                  index === activeIndex ? 'bg-surface-2 text-ink' : 'text-ink-muted',
                )}
              >
                <span className="truncate">
                  {isNew ? (
                    <>
                      Add <span className="font-medium text-ink">“{option.display_name}”</span>
                    </>
                  ) : (
                    option.display_name
                  )}
                </span>
                {!isNew && option.count > 0 && (
                  <span className="text-caption text-ink-subtle tabular-nums">{option.count}</span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
