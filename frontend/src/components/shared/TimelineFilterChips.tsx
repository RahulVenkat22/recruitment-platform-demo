import { FilterChips, type FilterChipOption } from '@/components/shared/FilterChips'
import { ACTIVITY_CATEGORIES, enumMeta, useEnumsStore } from '@/lib/enums'

export interface TimelineFilterChipsProps {
  selected: readonly string[]
  onChange: (selected: string[]) => void
  /** Events per category from the API; a missing key renders as 0. */
  counts?: Record<string, number>
  categories?: readonly string[]
  className?: string
}

/** The plan.md 9.6 category chips: every activity category with its colour and count. */
export function TimelineFilterChips({
  selected,
  onChange,
  counts,
  categories = ACTIVITY_CATEGORIES,
  className,
}: TimelineFilterChipsProps) {
  // Subscribe so labels and colours update once the enum catalogue lands.
  useEnumsStore((state) => state.catalogue)
  const options: FilterChipOption[] = categories.map((key) => {
    const meta = enumMeta('category', key)
    return { key, label: meta.label, color: meta.fg, bg: meta.bg, count: counts?.[key] ?? 0 }
  })
  return (
    <FilterChips
      aria-label="Timeline filters"
      options={options}
      selected={selected}
      onChange={onChange}
      allowAllNone
      className={className}
    />
  )
}
