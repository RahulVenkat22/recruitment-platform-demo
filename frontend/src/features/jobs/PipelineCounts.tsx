import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { PipelineCounts as Counts } from '@/types/domain'

const STAGES: { key: keyof Counts; short: string; label: string; color: string }[] = [
  { key: 'candidates', short: 'cand', label: 'Candidates', color: 'bg-avatar-slate' },
  { key: 'shortlisted', short: 'short', label: 'Shortlisted', color: 'bg-avatar-indigo' },
  { key: 'interviewed', short: 'int', label: 'Interviewed', color: 'bg-info' },
  { key: 'selected', short: 'sel', label: 'Selected', color: 'bg-success' },
  { key: 'onboarded', short: 'onb', label: 'Onboarded', color: 'bg-avatar-emerald' },
]

export interface PipelineCountsProps {
  counts: Counts
  className?: string
}

/**
 * The five pipeline numbers with caption labels (plan.md 9.4), and a thin
 * segmented bar that shows how far the funnel has progressed. Hover for names.
 */
export function PipelineCounts({ counts, className }: PipelineCountsProps) {
  const total = Math.max(1, counts.candidates)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-slot="pipeline-counts"
          className={cn('inline-flex min-w-0 flex-col gap-1', className)}
          aria-label={STAGES.map((stage) => `${stage.label} ${counts[stage.key]}`).join(', ')}
        >
          <div className="flex items-center gap-2.5">
            {STAGES.map((stage) => (
              <span key={stage.key} className="flex flex-col items-center leading-none">
                <span className="text-[13px] font-medium text-ink tabular-nums">
                  {counts[stage.key]}
                </span>
                <span className="mt-0.5 text-[10px] text-ink-subtle">{stage.short}</span>
              </span>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="flex h-1 w-full overflow-hidden rounded-pill bg-surface-3"
          >
            {STAGES.slice(1).map((stage) => {
              const width = Math.min(100, Math.round((counts[stage.key] / total) * 100))
              return width > 0 ? (
                <span
                  key={stage.key}
                  className={cn('h-full', stage.color)}
                  style={{ width: `${Math.max(width, 3)}%` }}
                />
              ) : null
            })}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-caption">
        {STAGES.map((stage) => `${stage.label}: ${counts[stage.key]}`).join(' · ')}
      </TooltipContent>
    </Tooltip>
  )
}
