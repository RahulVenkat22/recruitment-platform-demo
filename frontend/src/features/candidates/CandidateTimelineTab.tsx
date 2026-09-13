import { FileSignatureIcon, HistoryIcon, RocketIcon } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonTimeline } from '@/components/shared/Skeletons'
import { Timeline } from '@/components/shared/Timeline'
import { Button } from '@/components/ui/button'
import { flattenActivities, useTimeline } from '@/features/activity/api'
import { isActive, toTarget } from '@/features/applications/pipeline-target'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import { StageStepper } from '@/features/candidates/StageStepper'
import { OfferCard } from '@/features/offers/OfferCard'
import { OnboardingCard } from '@/features/onboarding/OnboardingCard'
import type { ApplicationDetail, CandidateApplication } from '@/types/domain'

/** plan.md 9.10 Timeline tab: the stage stepper, the offer and onboarding cards, then the events. */
export function CandidateTimelineTab({
  application,
  detail,
  previousStatus,
  actions,
}: {
  application: CandidateApplication
  detail?: ApplicationDetail
  previousStatus?: string | null
  actions?: ApplicationActionsHandle
}) {
  const feed = useTimeline({ application: application.id })
  const items = useMemo(() => flattenActivities(feed.data), [feed.data])
  const status = detail?.status ?? application.status
  const canManage = Boolean(detail?.permissions.can_manage) && isActive(status)
  const offerable = canManage && !detail?.offer && status === 'selected'
  const onboardable = canManage && !detail?.onboarding && status === 'offer_accepted'

  return (
    <div className="space-y-5">
      <section className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h3 className="mb-3 text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase">
          Pipeline · {application.job.title}
        </h3>
        <StageStepper status={status} previousStatus={previousStatus} />
        {actions && detail && (offerable || onboardable) && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            {offerable && (
              <Button type="button" size="sm" onClick={() => actions.makeOffer(toTarget(detail))}>
                <FileSignatureIcon data-icon="inline-start" aria-hidden="true" />
                Make an offer
              </Button>
            )}
            {onboardable && (
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  actions.startOnboarding(toTarget(detail), detail.offer?.joining_date)
                }
              >
                <RocketIcon data-icon="inline-start" aria-hidden="true" />
                Start onboarding
              </Button>
            )}
          </div>
        )}
      </section>
      {detail?.offer && actions && <OfferCard offer={detail.offer} actions={actions} />}
      {detail?.onboarding && <OnboardingCard onboarding={detail.onboarding} />}
      {feed.isPending ? (
        <SkeletonTimeline items={5} />
      ) : feed.isError ? (
        <ErrorState
          title="Couldn't load the timeline"
          error={feed.error}
          onRetry={() => void feed.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No events on this application yet"
          description="Contacts, interviews, decisions and offers will appear here."
        />
      ) : (
        <Timeline
          items={items}
          jobId={application.job_description}
          hasMore={feed.hasNextPage}
          loadingOlder={feed.isFetchingNextPage}
          onLoadOlder={() => void feed.fetchNextPage()}
        />
      )}
    </div>
  )
}
