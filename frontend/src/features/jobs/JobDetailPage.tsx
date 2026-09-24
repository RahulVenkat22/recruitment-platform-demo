import { FileQuestionIcon, PencilIcon, UserSearchIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ActionMenu, type RowAction } from '@/components/shared/ActionMenu'
import { AvatarGroup } from '@/components/shared/AvatarGroup'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { describeError } from '@/lib/errors'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useJob, useJobAction, useSetJobStatus } from '@/features/jobs/api'
import {
  isWorkable,
  jobSummaryLine,
  nextStatusOptions,
  participantsToPeople,
  JOB_METRICS,
  metricTabLink,
} from '@/features/jobs/job-utils'
import { JobOverview } from '@/features/jobs/JobOverview'
import { PeopleTab } from '@/features/jobs/PeopleTab'
import { StatusNoteDialog } from '@/features/jobs/StatusNoteDialog'
import { CandidatesTab } from '@/features/jobs/CandidatesTab'
import { KanbanTab } from '@/features/kanban/KanbanTab'
import { TimelineTab } from '@/features/jobs/TimelineTab'
import { useJobActions } from '@/features/jobs/useJobActions'
import { useJobWorkActions } from '@/features/home/useJobWorkActions'
import { VersionsTab } from '@/features/jobs/VersionsTab'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { param, useUrlState } from '@/lib/hooks'
import { getApiError } from '@/lib/api'
import { personFromUser, type JobDetail, type JobMetrics } from '@/types/domain'

const TABS = ['overview', 'people', 'timeline', 'candidates', 'kanban', 'versions'] as const
type TabKey = (typeof TABS)[number]

const TAB_SPEC = { tab: param.enum<TabKey>('overview', TABS) }

/**
 * The seven compact metric cards under the header (plan.md 9.6); each opens the
 * Candidates tab narrowed to the people it counts. Without `metrics` it renders
 * the loading state in the very same layout, so nothing jumps when the numbers
 * land (the row scrolls sideways on phones).
 */
function MetricRow({ metrics }: { metrics?: JobMetrics }) {
  return (
    <div
      className="mb-6 grid gap-3 max-md:-mx-4 max-md:flex max-md:overflow-x-auto max-md:px-4 max-md:pb-1 md:grid-cols-[repeat(auto-fit,minmax(132px,1fr))]"
      aria-label="Pipeline metrics"
      aria-busy={metrics ? undefined : true}
    >
      {JOB_METRICS.map((metric) => (
        <MetricCard
          key={metric.key}
          variant="compact"
          label={metric.label}
          value={metrics ? metrics[metric.key] : 0}
          loading={!metrics}
          to={metricTabLink(metric.key)}
          className="max-md:min-w-36 max-md:shrink-0"
        />
      ))}
    </div>
  )
}

function HeaderMeta({ job }: { job: JobDetail }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>Created by</span>
      <UserChip user={personFromUser(job.created_by)} />
      <span>on {formatDate(job.created_at)}</span>
      <span aria-hidden="true">•</span>
      <Tooltip>
        <TooltipTrigger asChild>
          <span>Updated {formatRelative(job.updated_at)}</span>
        </TooltipTrigger>
        <TooltipContent>{formatDateTime(job.updated_at)}</TooltipContent>
      </Tooltip>
      <span aria-hidden="true">•</span>
      <span className="tabular-nums">v{job.current_version}</span>
      {job.participants.length > 0 && (
        <span className="ml-auto flex items-center gap-2">
          <span>People Involved:</span>
          <AvatarGroup people={participantsToPeople(job.participants)} size="sm" max={4} />
        </span>
      )}
    </div>
  )
}

/** plan.md 9.6: the job description detail page with its tab strip and metric row. */
export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const job = useJob(id)
  const [{ tab }, setUrl] = useUrlState(TAB_SPEC)
  const actions = useJobActions({ onDeleted: () => navigate('/jobs') })
  const work = useJobWorkActions()
  const lifecycle = useJobAction()
  const setStatus = useSetJobStatus()
  const [statusTarget, setStatusTarget] = useState<{ key: string; label: string } | null>(null)

  const crumbs = [
    { label: 'Job Descriptions', to: '/jobs' },
    { label: job.data?.title ?? 'Job Description' },
  ]

  if (job.isPending) {
    return (
      <>
        <PageHeader
          title={
            <>
              <Skeleton className="h-7 w-56 bg-surface-3" />
              <span className="sr-only">Loading job description</span>
            </>
          }
          breadcrumbs={crumbs}
        />
        <MetricRow />
        <div className="grid gap-5 lg:grid-cols-3">
          <SkeletonCard lines={8} className="lg:col-span-2" />
          <SkeletonCard lines={6} />
        </div>
      </>
    )
  }

  if (job.isError) {
    const status = getApiError(job.error).status
    return (
      <>
        <PageHeader title="Job Description" breadcrumbs={crumbs} />
        {status === 404 || status === 403 ? (
          <EmptyState
            icon={FileQuestionIcon}
            title="Job description not found"
            description="It may have been deleted, or you are not involved in it. HR admins can see every job description."
            action={
              <Button asChild variant="outline">
                <Link to="/jobs">Back to job descriptions</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            title="Couldn't load this job description"
            error={job.error}
            onRetry={() => void job.refetch()}
          />
        )}
      </>
    )
  }

  const detail = job.data
  const canEdit = detail.permissions.can_edit
  const archived = detail.status === 'archived'

  async function moveStatus(target: { key: string; label: string }, note = '') {
    try {
      if (target.key === 'open' && detail.status === 'draft') {
        await lifecycle.mutateAsync({ id: detail.id, action: 'publish' })
        toast.success(`Published “${detail.title}”`)
        return
      }
      const updated = await setStatus.mutateAsync({ id: detail.id, status: target.key, note })
      toast.success(`“${updated.title}” is now ${updated.status_label.toLowerCase()}`)
    } catch (error) {
      toast.error(describeError(error))
      throw error
    }
  }

  const statusItems: RowAction[] = canEdit
    ? nextStatusOptions(detail.status).map((option, index) => ({
        key: `status-${option.key}`,
        label: option.label,
        groupLabel: index === 0 ? 'Status' : undefined,
        onSelect: () => {
          if (option.key === 'on_hold' || option.key === 'closed') setStatusTarget(option)
          else void moveStatus(option).catch(() => {})
        },
      }))
    : []
  // Status moves, then "Add comment" with the everyday actions, then "Force close" on its own at the end.
  const workItems = work.itemsFor(detail)
  const menuItems: RowAction[] = [
    ...statusItems,
    ...[
      ...workItems.filter((item) => item.key === 'comment'),
      ...actions
        .itemsFor(detail, { includeView: false })
        .filter((item) => item.key !== 'edit' && item.key !== 'search'),
    ].map((item, index) =>
      index === 0 && statusItems.length > 0 ? { ...item, separatorBefore: true } : item,
    ),
    ...workItems.filter((item) => item.key === 'force-close'),
  ]

  const tabLabel = (key: TabKey): ReactNode => {
    switch (key) {
      case 'overview':
        return 'Overview'
      case 'people':
        return (
          <>
            People Involved <Count value={detail.participants.length} />
          </>
        )
      case 'timeline':
        return 'Activity'
      case 'candidates':
        return (
          <>
            Candidates <Count value={detail.metrics.total_found} />
          </>
        )
      case 'kanban':
        return 'Discovery'
      case 'versions':
        return (
          <>
            Versions <Count value={detail.current_version} />
          </>
        )
    }
  }

  return (
    <>
      {/* One Tabs root spans the header strip, the metric row and the panels so each trigger controls a real panel id. */}
      <Tabs value={tab} onValueChange={(next) => setUrl({ tab: next as TabKey })} className="gap-0">
        <PageHeader
          title={detail.title}
          titleAddon={<StatusBadge status={detail.status} kind="jd_status" size="md" dot />}
          subtitle={jobSummaryLine(detail)}
          meta={<HeaderMeta job={detail} />}
          breadcrumbs={crumbs}
          actions={
            <>
              {detail.permissions.can_work_pipeline && isWorkable(detail.status) && (
                <Button asChild variant="outline">
                  <Link to={`/search?jd=${detail.id}`}>
                    <UserSearchIcon data-icon="inline-start" aria-hidden="true" />
                    Search Candidates
                  </Link>
                </Button>
              )}
              {canEdit && !archived && (
                <Button asChild>
                  <Link to={`/jobs/${detail.id}/edit`}>
                    <PencilIcon data-icon="inline-start" aria-hidden="true" />
                    Edit
                  </Link>
                </Button>
              )}
              <ActionMenu
                items={menuItems}
                label={`More actions for ${detail.title}`}
                variant="outline"
                size="icon"
              />
            </>
          }
          tabs={
            <TabsList
              variant="line"
              className="w-full justify-start overflow-x-auto border-b border-line"
            >
              {TABS.map((key) => (
                <TabsTrigger key={key} value={key} className="flex-none gap-1.5 px-3">
                  {tabLabel(key)}
                </TabsTrigger>
              ))}
            </TabsList>
          }
        />

        <MetricRow metrics={detail.metrics} />

        <TabsContent value="overview">
          <JobOverview
            content={detail}
            status={detail.status}
            createdBy={personFromUser(detail.created_by)}
            createdAt={detail.created_at}
            updatedAt={detail.updated_at}
            people={
              detail.participants.length > 0 ? (
                <AvatarGroup people={participantsToPeople(detail.participants)} size="sm" max={6} />
              ) : (
                <span className="text-ink-subtle">Nobody yet</span>
              )
            }
          />
        </TabsContent>
        <TabsContent value="people">
          <PeopleTab job={detail} />
        </TabsContent>
        <TabsContent value="timeline">
          <TimelineTab job={detail} />
        </TabsContent>
        <TabsContent value="candidates">
          <CandidatesTab job={detail} />
        </TabsContent>
        <TabsContent value="kanban">
          <KanbanTab job={detail} />
        </TabsContent>
        <TabsContent value="versions">
          <VersionsTab job={detail} />
        </TabsContent>
      </Tabs>

      {actions.dialogs}
      {work.dialogs}
      <StatusNoteDialog
        open={statusTarget !== null}
        onOpenChange={(open) => !open && setStatusTarget(null)}
        target={statusTarget}
        jobTitle={detail.title}
        onConfirm={(note) => (statusTarget ? moveStatus(statusTarget, note) : Promise.resolve())}
      />
    </>
  )
}

function Count({ value }: { value: number }) {
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-surface-2 px-1.5 text-caption text-ink-muted tabular-nums">
      {value}
    </span>
  )
}
