import { CalendarPlusIcon, CalendarXIcon } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { Button } from '@/components/ui/button'
import { isActive, toTarget } from '@/features/applications/pipeline-target'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import { useInterviews } from '@/features/interviews/api'
import { InterviewCard } from '@/features/interviews/InterviewCard'
import type { ApplicationDetail } from '@/types/domain'

/** plan.md 9.10 Interviews tab: one card per round, newest first, plus Schedule. */
export function CandidateInterviewsTab({
  application,
  actions,
}: {
  application: ApplicationDetail
  actions: ApplicationActionsHandle
}) {
  const list = useInterviews({
    application: application.id,
    ordering: '-scheduled_at',
    page_size: 50,
  })
  const canSchedule = application.permissions.can_transition && isActive(application.status)
  const rows = list.data?.results ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-small text-ink-muted">
          {list.data
            ? `${list.data.count} ${list.data.count === 1 ? 'interview' : 'interviews'}`
            : ''}
        </p>
        {canSchedule && (
          <Button type="button" onClick={() => actions.scheduleInterview(toTarget(application))}>
            <CalendarPlusIcon data-icon="inline-start" aria-hidden="true" />
            Schedule interview
          </Button>
        )}
      </div>
      {list.isPending ? (
        <div className="space-y-4">
          <SkeletonCard lines={3} avatar />
          <SkeletonCard lines={3} avatar />
        </div>
      ) : list.isError ? (
        <ErrorState
          title="Couldn't load interviews"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CalendarXIcon}
          title="No interviews yet"
          description="Schedule the first round; the interviewer and the owner are notified."
          action={
            canSchedule ? (
              <Button
                type="button"
                onClick={() => actions.scheduleInterview(toTarget(application))}
              >
                Schedule interview
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          {rows.map((interview) => (
            <InterviewCard key={interview.id} interview={interview} actions={actions} />
          ))}
        </div>
      )}
    </div>
  )
}
