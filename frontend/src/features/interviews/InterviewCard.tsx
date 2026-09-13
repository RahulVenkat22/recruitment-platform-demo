import {
  CalendarClockIcon,
  ExternalLinkIcon,
  MapPinIcon,
  PhoneIcon,
  VideoIcon,
  type LucideIcon,
} from 'lucide-react'
import { ActionMenu } from '@/components/shared/ActionMenu'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import {
  canJoin,
  formatScore,
  INTERVIEW_STATUS_CLASS,
  interviewActions,
  isOpen,
  RECOMMENDATION_CLASS,
} from '@/features/interviews/interview-utils'
import { formatDateTime, formatWhen } from '@/lib/format'
import { cn } from '@/lib/utils'
import { personFromUser, type Interview } from '@/types/domain'

const MODE_ICONS: Record<string, LucideIcon> = {
  video: VideoIcon,
  phone: PhoneIcon,
  onsite: MapPinIcon,
}

export function InterviewStatusPill({ status, label }: { status: string; label: string }) {
  return (
    <span
      data-slot="interview-status"
      data-status={status}
      className={cn(
        'inline-flex h-5 items-center rounded-pill px-2 text-caption font-medium',
        INTERVIEW_STATUS_CLASS[status] ?? 'bg-surface-2 text-ink-muted',
      )}
    >
      {label}
    </span>
  )
}

export function RecommendationPill({ value, label }: { value: string; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-pill px-2 text-caption font-medium',
        RECOMMENDATION_CLASS[value] ?? 'bg-surface-2 text-ink-muted',
      )}
    >
      {label}
    </span>
  )
}

/** plan.md 9.10 Interviews tab card: round, interviewer, time, mode, status, score and feedback. */
export function InterviewCard({
  interview,
  actions,
}: {
  interview: Interview
  actions: ApplicationActionsHandle
}) {
  const ModeIcon = MODE_ICONS[interview.mode] ?? VideoIcon
  const items = interviewActions(interview, actions)
  const feedbackAction = items.find((item) => item.key === 'feedback')
  const pendingFeedback = isOpen(interview) && new Date(interview.scheduled_at) < new Date()

  return (
    <article
      data-slot="interview-card"
      data-status={interview.status}
      className="rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-pill bg-info-soft px-2.5 text-small font-medium text-info">
              {interview.round_label}
            </span>
            <span className="text-caption text-ink-subtle">Round {interview.sequence}</span>
            <InterviewStatusPill status={interview.status} label={interview.status_label} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClockIcon aria-hidden="true" className="size-3.5" />
              <span className="text-ink" title={formatDateTime(interview.scheduled_at)}>
                {formatWhen(interview.scheduled_at)}
              </span>
              · {interview.duration_minutes} min
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ModeIcon aria-hidden="true" className="size-3.5" />
              {interview.mode_label}
              {interview.location ? ` · ${interview.location}` : ''}
            </span>
            {interview.meeting_link && (
              <a
                href={interview.meeting_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Meeting link <ExternalLinkIcon aria-hidden="true" className="size-3" />
              </a>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-small text-ink-muted">
            Interviewer:
            <UserChip user={personFromUser(interview.interviewer)} showRole />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {canJoin(interview) && (
            <Button asChild size="sm">
              <a href={interview.meeting_link ?? '#'} target="_blank" rel="noreferrer">
                Join
              </a>
            </Button>
          )}
          {feedbackAction && (pendingFeedback || interview.status !== 'completed') && (
            <Button size="sm" variant="outline" onClick={() => feedbackAction.onSelect?.()}>
              Submit feedback
            </Button>
          )}
          <ActionMenu items={items} label={`Actions for ${interview.round_label} interview`} />
        </div>
      </div>
      {interview.status === 'completed' && (
        <div className="mt-4 rounded-control bg-surface-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-h3 text-ink tabular-nums">{formatScore(interview.score)}</span>
            {interview.recommendation && (
              <RecommendationPill
                value={interview.recommendation}
                label={interview.recommendation_label ?? interview.recommendation}
              />
            )}
            {interview.feedback_submitted_at && (
              <span className="text-caption text-ink-subtle">
                Submitted {formatDateTime(interview.feedback_submitted_at)}
              </span>
            )}
          </div>
          {interview.feedback && (
            <p className="mt-2 text-small leading-relaxed whitespace-pre-line text-ink">
              {interview.feedback}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
