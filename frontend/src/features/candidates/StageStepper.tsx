import { CheckIcon } from 'lucide-react'
import { STAGES, stageIndex, TRAY_STATUSES } from '@/features/candidates/candidate-utils'
import { useEnumMeta } from '@/lib/enums'
import { cn } from '@/lib/utils'

export interface StageStepperProps {
  status: string
  previousStatus?: string | null
  className?: string
}

/** plan.md 9.10: the horizontal pipeline with completed, current and future stages. */
export function StageStepper({ status, previousStatus, className }: StageStepperProps) {
  const parked = TRAY_STATUSES.has(status)
  const current = stageIndex(parked ? (previousStatus ?? '') : status)
  const meta = useEnumMeta('status', status)

  return (
    <div className={cn('space-y-3', className)}>
      {parked && (
        <p
          className="inline-flex items-center gap-2 rounded-control px-2.5 py-1 text-small"
          style={{ background: meta.bg, color: meta.fg }}
        >
          <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
          {meta.label}
          {previousStatus && (
            <span className="opacity-80">
              · parked after {STAGES[stageIndex(previousStatus)]?.label ?? previousStatus}
            </span>
          )}
        </p>
      )}
      <ol
        aria-label="Pipeline stages"
        className="flex max-w-full items-start gap-0 overflow-x-auto pb-1 max-md:-mx-4 max-md:px-4"
      >
        {STAGES.map((stage, index) => {
          const done = index < current
          const active = index === current && !parked
          return (
            <li
              key={stage.key}
              className="flex min-w-[88px] flex-1 flex-col items-center text-center"
            >
              <div className="flex w-full items-center">
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-px flex-1',
                    index === 0 ? 'bg-transparent' : done || active ? 'bg-success' : 'bg-line',
                  )}
                />
                <span
                  className={cn(
                    'inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums',
                    done && 'border-success bg-success text-white',
                    active && 'border-primary bg-primary text-white ring-4 ring-primary-soft',
                    !done && !active && 'border-line-strong bg-surface text-ink-subtle',
                  )}
                >
                  {done ? <CheckIcon className="size-3" strokeWidth={3} /> : index + 1}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'h-px flex-1',
                    index === STAGES.length - 1
                      ? 'bg-transparent'
                      : done
                        ? 'bg-success'
                        : 'bg-line',
                  )}
                />
              </div>
              <span
                className={cn(
                  'mt-1.5 px-1 text-[11px] leading-tight',
                  active ? 'font-medium text-primary' : done ? 'text-ink' : 'text-ink-subtle',
                )}
              >
                {stage.label}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
