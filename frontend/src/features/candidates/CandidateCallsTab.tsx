import { PhoneOffIcon, PhoneOutgoingIcon } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { Button } from '@/components/ui/button'
import { isActive, toTarget } from '@/features/applications/pipeline-target'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import { useCalls } from '@/features/calls/api'
import { CallCard } from '@/features/calls/CallCard'
import type { ApplicationDetail } from '@/types/domain'

/** AI Calls tab: every AI phone call (real or simulated) with its summary, assessment and transcript. */
export function CandidateCallsTab({
  application,
  actions,
}: {
  application: ApplicationDetail
  actions: ApplicationActionsHandle
}) {
  const list = useCalls({ application: application.id, page_size: 50 })
  const canCall = application.permissions.can_transition && isActive(application.status)
  const rows = list.data?.results ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-small text-ink-muted">
          {list.data ? `${list.data.count} ${list.data.count === 1 ? 'call' : 'calls'}` : ''}
        </p>
        {canCall && (
          <Button type="button" onClick={() => actions.callCandidate(toTarget(application))}>
            <PhoneOutgoingIcon data-icon="inline-start" aria-hidden="true" />
            Call candidate (AI)
          </Button>
        )}
      </div>
      {list.isPending ? (
        <div className="space-y-4">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : list.isError ? (
        <ErrorState
          title="Couldn't load calls"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={PhoneOffIcon}
          title="No AI calls yet"
          description="Run a knowledge screening or deliver a message by phone; the transcript and assessment appear here."
          action={
            canCall ? (
              <Button type="button" onClick={() => actions.callCandidate(toTarget(application))}>
                Call candidate (AI)
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((call) => (
            <CallCard key={call.id} call={call} onResume={actions.resumeSimulatedCall} />
          ))}
        </ul>
      )}
    </div>
  )
}
