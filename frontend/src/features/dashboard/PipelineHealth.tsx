import { StackedBar } from '@/features/dashboard/charts/StackedBar'
import { stageColor } from '@/features/dashboard/charts/theme'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import type { InsightStage } from '@/types/domain'

/**
 * Where the pipeline stands right now and how long people have sat there: a
 * stacked split by stage, then one row per stage whose bar is the average days
 * in it, with how many have waited over a week. A row opens those candidates.
 */
export function PipelineHealth({
  stages,
  onSelect,
}: {
  stages: readonly InsightStage[]
  onSelect: (stage: InsightStage) => void
}) {
  const total = stages.reduce((sum, stage) => sum + stage.value, 0)
  const maxDays = Math.max(1, ...stages.map((stage) => stage.avg_days ?? 0))
  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-caption text-ink-subtle">
          <span>Candidates by stage</span>
          <span className="tabular-nums">{formatCount(total)} in the pipeline</span>
        </div>
        <StackedBar
          segments={stages.map((stage) => ({
            key: stage.key,
            label: stage.label,
            value: stage.value,
            color: stageColor(stage.key),
          }))}
          title="Candidates by stage"
        />
      </div>
      <ul className="space-y-0.5" aria-label="Average days in each stage">
        {stages.map((stage) => (
          <li key={stage.key}>
            <button
              type="button"
              onClick={() => onSelect(stage)}
              className={cn(
                '-mx-2 block w-[calc(100%+1rem)] rounded-control px-2 py-1.5 text-left transition-colors duration-150 ease-brand hover:bg-surface-2',
                'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
              )}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2 text-small text-ink">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ background: stageColor(stage.key) }}
                  />
                  <span className="truncate">{stage.label}</span>
                  <span className="text-ink-subtle tabular-nums">{formatCount(stage.value)}</span>
                </span>
                <span className="shrink-0 text-caption tabular-nums">
                  {stage.stuck > 0 && (
                    <span className="mr-2 text-warning">
                      {formatCount(stage.stuck)} over a week
                    </span>
                  )}
                  <span className="font-medium text-ink">
                    {stage.avg_days === null ? '—' : `${stage.avg_days}d avg`}
                  </span>
                </span>
              </span>
              <span className="mt-1 block h-1.5 w-full rounded-pill bg-surface-2">
                <span
                  className="block h-full rounded-pill"
                  style={{
                    width: `${((stage.avg_days ?? 0) / maxDays) * 100}%`,
                    background: stageColor(stage.key),
                  }}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-auto border-t border-line pt-3 text-caption text-ink-subtle">
        Bars are the average days candidates have sat in the stage. Click one to see who is there.
      </p>
    </div>
  )
}
