import { CalendarClockIcon } from 'lucide-react'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { StackedBar } from '@/features/dashboard/charts/StackedBar'
import { OUTCOME_COLORS, SERIES } from '@/features/dashboard/charts/theme'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import { cn } from '@/lib/utils'
import type { InterviewInsights } from '@/types/domain'

function Stat({
  label,
  value,
  hint,
  onClick,
  tone,
}: {
  label: string
  value: string
  hint?: string
  onClick?: () => void
  tone?: 'warning'
}) {
  const body = (
    <>
      <span className="block text-caption text-ink-subtle">{label}</span>
      <span
        className={cn(
          'mt-0.5 block font-heading text-[22px] leading-7 font-semibold',
          tone === 'warning' ? 'text-warning' : 'text-ink',
        )}
      >
        {value}
      </span>
      {hint && <span className="block truncate text-caption text-ink-subtle">{hint}</span>}
    </>
  )
  const classes = 'min-w-0 rounded-control bg-surface-2 px-3 py-2 text-left'
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        classes,
        'transition-colors duration-150 ease-brand hover:bg-surface-3',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      )}
    >
      {body}
    </button>
  ) : (
    <div className={classes}>{body}</div>
  )
}

export type InterviewFigure = 'interviews' | 'feedback_pending'

/**
 * How interviewing went: completed count, average score, feedback still owed,
 * the recommendation split as a diverging bar, and who carried the load. The
 * completed and feedback figures open their interviews in place.
 */
export function InterviewOutcomes({
  insights,
  onSelect,
}: {
  insights: InterviewInsights
  onSelect: (figure: InterviewFigure) => void
}) {
  const feedback = insights.recommendations.reduce((sum, row) => sum + row.value, 0)
  const maxLoad = Math.max(1, ...insights.interviewers.map((row) => row.total))

  if (insights.total === 0 && insights.feedback_pending === 0 && insights.upcoming === 0) {
    return (
      <EmptyState
        size="sm"
        icon={CalendarClockIcon}
        title="No interviews in this window"
        description="Scores, recommendations and interviewer load appear once interviews are held."
      />
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="Completed"
          value={formatCount(insights.completed)}
          hint={`of ${formatCount(insights.total)} held`}
          onClick={() => onSelect('interviews')}
        />
        <Stat
          label="Avg score"
          value={insights.avg_score === null ? '—' : `${insights.avg_score}`}
          hint="out of 10"
        />
        <Stat
          label="Feedback owed"
          value={formatCount(insights.feedback_pending)}
          hint={insights.upcoming ? `${insights.upcoming} upcoming` : undefined}
          onClick={() => onSelect('feedback_pending')}
          tone={insights.feedback_pending > 0 ? 'warning' : undefined}
        />
      </div>
      <div>
        <div className="mb-1.5 flex items-center justify-between text-caption text-ink-subtle">
          <span>Recommendations</span>
          <span className="tabular-nums">{formatCount(feedback)} with feedback</span>
        </div>
        <StackedBar
          segments={insights.recommendations.map((row) => ({
            key: row.key,
            label: row.label,
            value: row.value,
            color: OUTCOME_COLORS[row.key] ?? OUTCOME_COLORS.hold,
          }))}
          title="Recommendations"
        />
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1" aria-label="Recommendation counts">
          {insights.recommendations.map((row) => (
            <li
              key={row.key}
              className="inline-flex items-center gap-1.5 text-caption text-ink-muted"
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-[3px]"
                style={{ background: OUTCOME_COLORS[row.key] ?? OUTCOME_COLORS.hold }}
              />
              {row.label}
              <span className="font-medium text-ink tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
      </div>
      {insights.interviewers.length > 0 && (
        <div className="min-w-0">
          <p className="mb-1.5 text-caption text-ink-subtle">Interviewer load</p>
          <ul className="space-y-1.5" aria-label="Interviews per interviewer">
            {insights.interviewers.map((row) => (
              <li key={row.user.id} className="flex items-center gap-2.5">
                <Avatar name={row.user.full_name} src={row.user.avatar_url} size="xs" />
                <span className="w-28 shrink-0 truncate text-small text-ink">
                  {row.user.full_name}
                </span>
                <span
                  role="img"
                  aria-label={`${row.total} interviews, ${row.completed} completed`}
                  className="h-2.5 min-w-0 flex-1"
                >
                  <span
                    className="block h-full rounded-r-[4px]"
                    style={{ width: `${(row.total / maxLoad) * 100}%`, background: SERIES[0] }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-caption text-ink-muted tabular-nums">
                  {row.completed}/{row.total}
                  {row.avg_score !== null && (
                    <span className="text-ink-subtle"> · {row.avg_score}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
