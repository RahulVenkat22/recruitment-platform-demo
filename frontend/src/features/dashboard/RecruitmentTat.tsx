import { TimerIcon } from 'lucide-react'
import { StatTile } from '@/features/dashboard/StatTile'
import type { DashboardInsights, DashboardMetric } from '@/types/domain'

export function RecruitmentTat({
  tat,
  candidateMetric,
  rangeDays,
  onCandidates,
  active,
  loading,
}: {
  tat: DashboardInsights['tat']
  candidateMetric?: DashboardMetric
  rangeDays: number
  onCandidates: () => void
  active: boolean
  loading: boolean
}) {
  const maxDays = Math.max(1, ...tat.stages.map((stage) => stage.avg_days))
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(220px,1fr)_2fr]">
      <div className="space-y-3">
        {candidateMetric || loading ? (
          <StatTile
            label="Candidate TAT"
            icon={TimerIcon}
            metric={candidateMetric}
            rangeDays={rangeDays}
            goodDirection="down"
            onClick={onCandidates}
            active={active}
            loading={loading}
          />
        ) : (
          <p className="text-small text-ink-muted">
            Candidate TAT is unavailable. Retry the summary above.
          </p>
        )}
        <p className="text-small text-ink-muted">
          Based on {tat.hires} completed {tat.hires === 1 ? 'hire' : 'hires'} in the selected
          period. Recruitment TAT starts when a job is published; candidate TAT starts when the
          candidate is added to that job. Both end at completed onboarding.
        </p>
        <p className="text-caption text-ink-subtle">
          Calendar days include weekends and holds. Each stage averages the total time per hire who
          visited it, including repeat visits.
        </p>
        {tat.incomplete_histories > 0 && (
          <p className="rounded-control bg-surface-2 p-3 text-small text-ink-muted">
            {tat.incomplete_histories} {tat.incomplete_histories === 1 ? 'hire has' : 'hires have'}{' '}
            incomplete stage history and {tat.incomplete_histories === 1 ? 'is' : 'are'} excluded
            from stage averages. Their overall TAT is still included.
          </p>
        )}
      </div>
      {tat.stages.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center rounded-control bg-surface-2 p-5 text-center text-small text-ink-muted">
          {tat.hires === 0
            ? 'No completed hires in this period. Try a wider date range.'
            : 'No complete stage histories are available for these hires.'}
        </div>
      ) : (
        <ul
          className="grid content-start gap-x-6 gap-y-3 sm:grid-cols-2"
          aria-label="Average time per stage for completed hires"
        >
          {tat.stages.map((stage) => (
            <li key={stage.key}>
              <div className="flex items-center justify-between gap-3 text-small">
                <span className="text-ink">{stage.label}</span>
                <span className="shrink-0 font-medium text-ink tabular-nums">
                  {stage.avg_days}d
                </span>
              </div>
              <div
                aria-hidden="true"
                className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface-2"
              >
                <div
                  className="h-full rounded-pill bg-primary"
                  style={{ width: `${(stage.avg_days / maxDays) * 100}%` }}
                />
              </div>
              <p className="mt-1 text-caption text-ink-subtle">
                {stage.hires} {stage.hires === 1 ? 'hire' : 'hires'} visited this stage
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
