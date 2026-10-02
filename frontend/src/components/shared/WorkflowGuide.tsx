import { ArrowRightIcon, CheckCheckIcon, ScanTextIcon, SparklesIcon } from 'lucide-react'
import { StaggerItem } from '@/components/shared/Stagger'

export interface WorkflowStep {
  title: string
  description: string
}
const ICONS = [ScanTextIcon, SparklesIcon, CheckCheckIcon]

/** A compact explanation of the next steps, shared by the AI-assisted workflows. */
export function WorkflowGuide({ steps, label }: { steps: readonly WorkflowStep[]; label: string }) {
  return (
    <section aria-label={label} className="mb-5 grid grid-cols-3 gap-3">
      {steps.map((step, index) => {
        const Icon = ICONS[index % ICONS.length]
        return (
          <StaggerItem key={step.title} index={index}>
            <div className="flex h-full items-start gap-3 rounded-2xl border border-line bg-surface/80 p-4 max-md:flex-col max-md:gap-2 max-md:p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon aria-hidden="true" className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-semibold text-ink max-md:text-[10px]">
                  {step.title}
                </p>
                <p className="mt-1 text-[11px]/[18px] text-ink-subtle max-md:hidden">
                  {step.description}
                </p>
              </div>
              {index < steps.length - 1 && (
                <ArrowRightIcon
                  aria-hidden="true"
                  className="mt-2 size-3 shrink-0 text-ink-subtle/50 max-md:hidden"
                />
              )}
            </div>
          </StaggerItem>
        )
      })}
    </section>
  )
}
