import { CheckIcon } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { FormSectionId } from '@/features/jobs/job-form-schema'
import { cn } from '@/lib/utils'

export interface FormRailProps {
  sections: readonly { id: FormSectionId; label: string }[]
  complete: Record<FormSectionId, boolean>
  active: FormSectionId
  percent: number
  onSelect: (id: FormSectionId) => void
  className?: string
}

/** Left rail of the JD form (plan.md 9.5): section anchors with completion state and a meter. */
export function FormRail({
  sections,
  complete,
  active,
  percent,
  onSelect,
  className,
}: FormRailProps) {
  return (
    <nav
      aria-label="Form sections"
      className={cn(
        'rounded-card border border-line bg-surface p-4 shadow-card',
        'max-lg:flex max-lg:items-center max-lg:gap-3 max-lg:overflow-x-auto',
        className,
      )}
    >
      <ol className="flex gap-1 max-lg:flex-1 max-lg:min-w-max lg:flex-col">
        {sections.map((section, index) => {
          const done = complete[section.id]
          const current = active === section.id
          return (
            <li key={section.id}>
              <button
                type="button"
                aria-current={current ? 'step' : undefined}
                onClick={() => onSelect(section.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-control px-3 py-3 text-left text-small transition-colors duration-150 ease-brand',
                  current
                    ? 'bg-primary-soft font-medium text-primary'
                    : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-7 shrink-0 transition-[background-color,border-color] duration-300 items-center justify-center rounded-full border text-[11px] tabular-nums',
                    done
                      ? 'border-success bg-success text-white'
                      : current
                        ? 'border-primary text-primary'
                        : 'border-line-strong text-ink-subtle',
                  )}
                >
                  {done ? <CheckIcon className="size-3" strokeWidth={3} /> : index + 1}
                </span>
                <span className="whitespace-nowrap">{section.label}</span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="max-lg:min-w-40 lg:mt-4 lg:border-t lg:border-line lg:pt-4">
        <div className="flex items-center justify-between text-caption text-ink-muted">
          <span>Completion</span>
          <span className="font-medium text-ink tabular-nums">{percent}%</span>
        </div>
        <Progress value={percent} aria-label={`${percent}% complete`} className="mt-2 h-1.5" />
      </div>
    </nav>
  )
}
