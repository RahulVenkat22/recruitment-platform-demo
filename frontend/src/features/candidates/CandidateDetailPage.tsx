import {
  BriefcaseIcon,
  CalendarPlusIcon,
  ExternalLinkIcon,
  ListChecksIcon,
  LockIcon,
  MailIcon,
  PhoneCallIcon,
  PhoneIcon,
  UserRoundXIcon,
  XCircleIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { ActionMenu, type RowAction } from '@/components/shared/ActionMenu'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MatchRing } from '@/components/shared/MatchRing'
import { PageHeader } from '@/components/shared/PageHeader'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { SourceBadge } from '@/components/shared/SourceBadge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTimeline } from '@/features/activity/api'
import { useApplication } from '@/features/applications/api'
import { formatYears, SHORTLISTABLE } from '@/features/applications/application-utils'
import { isActive, toTarget } from '@/features/applications/pipeline-target'
import { StatusTransitionMenu } from '@/features/applications/StatusTransitionMenu'
import { useApplicationActions } from '@/features/applications/useApplicationActions'
import { AddToJobDialog } from '@/features/candidates/AddToJobDialog'
import { useCandidate } from '@/features/candidates/api'
import { OpenResumeButton } from '@/features/candidates/OpenResumeButton'
import { isMasked, isPlaceholderEmail, pickContext } from '@/features/candidates/candidate-utils'
import { CandidateInterviewsTab } from '@/features/candidates/CandidateInterviewsTab'
import { CandidateTimelineTab } from '@/features/candidates/CandidateTimelineTab'
import { CommunicationsTab } from '@/features/candidates/CommunicationsTab'
import { MatchAnalysisTab } from '@/features/candidates/MatchAnalysisTab'
import { ProfileTab } from '@/features/candidates/ProfileTab'
import { getApiError } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { param, useUrlState } from '@/lib/hooks'
import { personFromUser, type ApplicationDetail } from '@/types/domain'

const TABS = ['profile', 'match', 'timeline', 'interviews', 'communications'] as const
type TabKey = (typeof TABS)[number]
const SPEC = { jd: param.string(''), tab: param.enum<TabKey>('profile', TABS) }

function Count({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-surface-2 px-1.5 text-caption text-ink-muted tabular-nums">
      {value}
    </span>
  )
}

function NoContext({ onAdd, canAdd }: { onAdd: () => void; canAdd: boolean }) {
  return (
    <EmptyState
      icon={BriefcaseIcon}
      title="Not attached to a job description yet"
      description="Match analysis and the pipeline timeline appear once this candidate is on a role."
      action={
        canAdd ? (
          <Button type="button" onClick={onAdd}>
            Add to job description
          </Button>
        ) : undefined
      }
    />
  )
}

/** plan.md 9.10 Candidate detail with the JD context selector and five tabs. */
export default function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [{ jd, tab }, setUrl] = useUrlState(SPEC)
  const candidate = useCandidate(id)
  const context = useMemo(
    () => (candidate.data ? pickContext(candidate.data.applications, jd || undefined) : undefined),
    [candidate.data, jd],
  )
  const application = useApplication(context?.id)
  const timeline = useTimeline({ application: context?.id ?? '' }, Boolean(context))
  const actions = useApplicationActions()
  const [addOpen, setAddOpen] = useState(false)

  const crumbs = [
    { label: 'Candidates', to: '/candidates' },
    { label: candidate.data?.full_name ?? 'Candidate' },
  ]

  if (candidate.isPending) {
    return (
      <>
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <Skeleton className="size-16 shrink-0 rounded-full bg-surface-3" />
              <Skeleton className="h-7 w-56 bg-surface-3" />
              <span className="sr-only">Loading candidate</span>
            </span>
          }
          breadcrumbs={crumbs}
        />
        <div aria-busy="true" aria-label="Loading candidate" className="grid gap-5 lg:grid-cols-3">
          <SkeletonCard lines={6} className="lg:col-span-2" />
          <SkeletonCard lines={4} />
        </div>
      </>
    )
  }
  if (candidate.isError) {
    const status = getApiError(candidate.error).status
    return (
      <>
        <PageHeader title="Candidate" breadcrumbs={crumbs} />
        {status === 404 || status === 403 ? (
          <EmptyState
            icon={UserRoundXIcon}
            title="Candidate not found"
            description="They may have been removed, or you are not involved in any of their job descriptions."
            action={
              <Button asChild variant="outline">
                <Link to="/candidates">Back to candidates</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState
            title="Couldn't load this candidate"
            error={candidate.error}
            onRetry={() => void candidate.refetch()}
          />
        )}
      </>
    )
  }

  const person = candidate.data
  const canEdit = person.permissions.can_edit
  const masked = isMasked(person.email) || isMasked(person.phone)
  const row = application.data
  const timelineTotal = timeline.data?.pages[0]?.total

  // The application query feeds the Interviews and Communications tabs (and the
  // offer, onboarding and actions on the timeline). When it fails those tabs show
  // the error with a retry instead of a skeleton that never resolves.
  const applicationError = (className?: string): ReactNode =>
    application.isError ? (
      <ErrorState
        variant="inline"
        className={className}
        title="Couldn't load this application"
        error={application.error}
        onRetry={() => void application.refetch()}
      />
    ) : null
  const withRow = (render: (detail: ApplicationDetail) => ReactNode): ReactNode => {
    if (!context) return <NoContext onAdd={() => setAddOpen(true)} canAdd={canEdit} />
    if (row) return render(row)
    return applicationError() ?? <SkeletonCard lines={4} />
  }

  const quick = row?.permissions.can_transition && isActive(row.status)
  const menuItems: RowAction[] = [
    ...(row
      ? actions
          .itemsFor(row)
          .filter(
            (item) =>
              !['profile', 'contact', 'interview', 'shortlist', 'reject'].includes(item.key),
          )
      : []),
    ...(canEdit
      ? [
          {
            key: 'add-to-job',
            label: 'Add to job description…',
            icon: BriefcaseIcon,
            separatorBefore: Boolean(row),
            onSelect: () => setAddOpen(true),
          },
        ]
      : []),
  ]

  const tabLabel = (key: TabKey): ReactNode => {
    switch (key) {
      case 'profile':
        return 'Profile'
      case 'match':
        return 'AI Match Analysis'
      case 'timeline':
        return (
          <>
            Timeline <Count value={timelineTotal} />
          </>
        )
      case 'interviews':
        return (
          <>
            Interviews <Count value={row?.interview_count} />
          </>
        )
      case 'communications':
        return (
          <>
            Communications <Count value={row?.communication_count} />
          </>
        )
    }
  }

  return (
    <>
      {/* One Tabs root holds the strip (inside the header) and the panels, so the
          triggers' aria-controls point at panels that exist. */}
      <Tabs value={tab} onValueChange={(next) => setUrl({ tab: next as TabKey })} className="gap-0">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              <Avatar name={person.full_name} src={person.avatar_url} size="xl" />
              <span>{person.full_name}</span>
            </span>
          }
          subtitle={[person.headline, person.location, formatYears(person.total_experience_years)]
            .filter(Boolean)
            .join(' • ')}
          meta={
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <MailIcon aria-hidden="true" className="size-3.5" />
                  {isPlaceholderEmail(person.email) ? (
                    <span className="text-ink-subtle">No email in the resume</span>
                  ) : (
                    person.email
                  )}
                </span>
                {person.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <PhoneIcon aria-hidden="true" className="size-3.5" />
                    {person.phone}
                  </span>
                )}
                {masked && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 text-ink-subtle">
                        <LockIcon aria-hidden="true" className="size-3.5" /> Hidden
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Contact details are hidden for your role.</TooltipContent>
                  </Tooltip>
                )}
                {person.linkedin_url && (
                  <a
                    href={person.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    LinkedIn <ExternalLinkIcon aria-hidden="true" className="size-3" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
                {person.github_url && (
                  <a
                    href={person.github_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    GitHub <ExternalLinkIcon aria-hidden="true" className="size-3" />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
                <OpenResumeButton
                  candidateId={person.id}
                  resume={person.resume}
                  fallbackUrl={person.resume_url}
                  variant="link"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  Sources: <SourceBadge source={person.sources} />
                </span>
                {row?.owner && (
                  <span className="inline-flex items-center gap-1.5">
                    Owner: <UserChip user={personFromUser(row.owner)} />
                  </span>
                )}
                {row && <span>Last activity {formatRelative(row.last_activity_at)}</span>}
              </div>
            </div>
          }
          breadcrumbs={crumbs}
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {person.applications.length > 0 && (
                <Select
                  value={context?.job_description ?? ''}
                  onValueChange={(value) => setUrl({ jd: value })}
                >
                  <SelectTrigger aria-label="Context job description" className="max-w-64">
                    <span className="text-ink-subtle">Context:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    {person.applications.map((entry) => (
                      <SelectItem key={entry.id} value={entry.job_description}>
                        {entry.job.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {row?.match && <MatchRing value={row.match.overall_pct} size="md" />}
              {row && <StatusBadge status={row.status} size="md" dot />}
              {row?.permissions.can_transition && (
                <StatusTransitionMenu application={row} actions={actions} />
              )}
              <ActionMenu
                items={menuItems}
                label={`More actions for ${person.full_name}`}
                variant="outline"
                size="icon"
              />
              {row && quick && (
                <div
                  className="flex w-full flex-wrap items-center justify-end gap-2"
                  data-slot="quick-actions"
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => actions.logContact(toTarget(row))}
                  >
                    <PhoneCallIcon data-icon="inline-start" aria-hidden="true" />
                    Log contact
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => actions.scheduleInterview(toTarget(row))}
                  >
                    <CalendarPlusIcon data-icon="inline-start" aria-hidden="true" />
                    Schedule interview
                  </Button>
                  {SHORTLISTABLE.has(row.status) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void actions.shortlist(row)}
                    >
                      <ListChecksIcon data-icon="inline-start" aria-hidden="true" />
                      Shortlist
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-danger hover:bg-danger-soft hover:text-danger"
                    onClick={() => actions.reject(row)}
                  >
                    <XCircleIcon data-icon="inline-start" aria-hidden="true" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
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

        <TabsContent value="profile">
          <ProfileTab candidate={person} />
        </TabsContent>
        <TabsContent value="match">
          {context ? (
            <MatchAnalysisTab applicationId={context.id} jobId={context.job_description} />
          ) : (
            <NoContext onAdd={() => setAddOpen(true)} canAdd={canEdit} />
          )}
        </TabsContent>
        <TabsContent value="timeline">
          {context ? (
            <>
              {applicationError('mb-4')}
              <CandidateTimelineTab
                application={context}
                detail={row}
                previousStatus={row?.previous_status}
                actions={actions}
              />
            </>
          ) : (
            <NoContext onAdd={() => setAddOpen(true)} canAdd={canEdit} />
          )}
        </TabsContent>
        <TabsContent value="interviews">
          {withRow((detail) => (
            <CandidateInterviewsTab application={detail} actions={actions} />
          ))}
        </TabsContent>
        <TabsContent value="communications">
          {withRow((detail) => (
            <CommunicationsTab application={detail} actions={actions} />
          ))}
        </TabsContent>
      </Tabs>

      {actions.dialogs}
      <AddToJobDialog
        candidate={person}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={(jobId) => setUrl({ jd: jobId, tab: 'match' })}
      />
    </>
  )
}
