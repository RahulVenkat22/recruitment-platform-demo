import { useId } from 'react'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Switch } from '@/components/ui/switch'
import { focusRovingSibling, rovingIndex } from '@/lib/keyboard'
import { PAGE_SIZES, useUiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'

/** Label and description on the left, control on the right; stacked on phones. */
const ROW_CLASS = 'items-start justify-between gap-6 max-sm:flex-col max-sm:items-start'

/** Workspace preferences kept in localStorage through the persisted UI store. */
export function PreferencesPanel() {
  const ids = { sidebar: useId(), pageSize: useId(), motion: useId() }
  const motionEffects = useUiStore((state) => state.motionEffects)
  const setMotionEffects = useUiStore((state) => state.setMotionEffects)
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((state) => state.setSidebarCollapsed)
  const pageSize = useUiStore((state) => state.pageSize)
  const setPageSize = useUiStore((state) => state.setPageSize)
  const nothingChecked = !PAGE_SIZES.includes(pageSize)

  return (
    <div className="space-y-6">
      <Field orientation="horizontal" className={ROW_CLASS}>
        <FieldContent>
          <FieldLabel htmlFor={ids.motion}>Interface animations</FieldLabel>
          <FieldDescription>
            Smooth page transitions, animated insights and ambient effects. Your device's
            reduced-motion setting is always respected.
          </FieldDescription>
        </FieldContent>
        <Switch id={ids.motion} checked={motionEffects} onCheckedChange={setMotionEffects} />
      </Field>
      <Field orientation="horizontal" className={ROW_CLASS}>
        <FieldContent>
          <FieldLabel htmlFor={ids.sidebar}>Start with the sidebar collapsed</FieldLabel>
          <FieldDescription>
            Shows icons only. You can still expand it from the bottom of the sidebar.
          </FieldDescription>
        </FieldContent>
        <Switch id={ids.sidebar} checked={sidebarCollapsed} onCheckedChange={setSidebarCollapsed} />
      </Field>

      <Field orientation="horizontal" className={ROW_CLASS}>
        <FieldContent>
          <span id={ids.pageSize} className="text-sm font-medium text-ink">
            Rows per page
          </span>
          <FieldDescription>
            Default for every list: job descriptions, candidates, interviews.
          </FieldDescription>
        </FieldContent>
        <div
          role="radiogroup"
          aria-labelledby={ids.pageSize}
          className="inline-flex shrink-0 rounded-control border border-line bg-surface p-0.5"
        >
          {PAGE_SIZES.map((size, index) => {
            const selected = size === pageSize
            // Roving tabindex: one tab stop for the group, arrows move between sizes.
            const tabStop = selected || (nothingChecked && index === 0)
            return (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={tabStop ? 0 : -1}
                onClick={() => setPageSize(size)}
                onKeyDown={(event) => {
                  const next = rovingIndex(event.key, index, PAGE_SIZES.length)
                  if (next === null) return
                  event.preventDefault()
                  setPageSize(PAGE_SIZES[next])
                  focusRovingSibling(event.currentTarget.parentElement, next)
                }}
                className={cn(
                  'h-7 min-w-12 rounded-[4px] px-3 text-small tabular-nums transition-colors duration-150 ease-brand',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  selected
                    ? 'bg-ink text-white'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {size}
              </button>
            )
          })}
        </div>
      </Field>
    </div>
  )
}
