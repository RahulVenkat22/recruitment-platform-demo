import {
  BriefcaseIcon,
  CalendarClockIcon,
  ExternalLinkIcon,
  FileSignatureIcon,
  HistoryIcon,
  ListChecksIcon,
  RocketIcon,
  SparklesIcon,
  UserCheckIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FunnelChart } from '@/components/shared/FunnelChart'
import { MatchRing } from '@/components/shared/MatchRing'
import { MetricCard } from '@/components/shared/MetricCard'
import { PageHeader } from '@/components/shared/PageHeader'
import { SkeletonCard, SkeletonMetricRow, SkeletonTimeline } from '@/components/shared/Skeletons'
import { StaggerItem } from '@/components/shared/Stagger'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Timeline } from '@/components/shared/Timeline'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { candidateHref } from '@/features/applications/application-utils'
import {
  useDashboardSummary,
  useFunnel,
  useRecentActivity,
  useTopCandidates,
  useUpcomingInterviews,
} from '@/features/dashboard/api'
import { canJoin, candidateHrefFor } from '@/features/interviews/interview-utils'
import { useJobList } from '@/features/jobs/api'
import { useAuthStore } from '@/lib/auth-store'
import { formatDate, formatWhen } from '@/lib/format'
import { cn } from '@/lib/utils'
import { personFromUser, type DashboardSummary } from '@/types/domain'

const METRICS: { key: keyof DashboardSummary; label: string; icon: LucideIcon; to: string }[] = [
  { key: 'active_jds', label: 'Active JDs', icon: BriefcaseIcon, to: '/jobs?status=open' },
  { key: 'total_candidates', label: 'Total candidates', icon: UsersIcon, to: '/candidates' },
  {
    key: 'new_candidates',
    label: 'New candidates',
    icon: UserPlusIcon,
    to: '/candidates?sort=-created_at',
  },
  {
    key: 'shortlisted',
    label: 'Shortlisted',
    icon: ListChecksIcon,
    to: '/candidates?status=ai_shortlisted,hr_review',
  },
  {
    key: 'interviews_scheduled',
    label: 'Interviews (7 days)',
    icon: CalendarClockIcon,
    to: '/interviews?bucket=upcoming',
  },
  { key: 'selected', label: 'Selected', icon: UserCheckIcon, to: '/candidates?status=selected' },
  {
    key: 'offers_pending',
    label: 'Offers pending',
    icon: FileSignatureIcon,
    to: '/candidates?status=offer_sent',
  },
  { key: 'onboarded', label: 'Onboarded', icon: RocketIcon, to: '/candidates?status=onboarded' },
]

function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function Widget({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'min-w-0 rounded-card border border-line bg-surface p-5 shadow-card',
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2
          id={headingId}
          className="min-w-0 truncate text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase"
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Row-shaped placeholder for the list widgets, so the layout does not jump when data lands. */
function WidgetRowsSkeleton({
  rows,
  avatars = false,
  label,
}: {
  rows: number
  /** Match ring plus avatar circles, as in the Top candidates rows. */
  avatars?: boolean
  label: string
}) {
  return (
    <ul aria-busy="true" aria-label={label} className="divide-y divide-line">
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-center gap-3 py-2.5">
          {avatars && (
            <>
              <Skeleton className="size-8 shrink-0 rounded-full bg-surface-3" />
              <Skeleton className="size-6 shrink-0 rounded-full bg-surface-3" />
            </>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn('h-3.5 bg-surface-3', index % 2 ? 'w-1/2' : 'w-2/3')} />
            <Skeleton className="h-3 w-1/3 bg-surface-3" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0 rounded-pill bg-surface-3" />
        </li>
      ))}
    </ul>
  )
}

/** plan.md 9.3 Dashboard: eight metric cards, funnel, recent activity, top candidates, upcoming interviews. */
export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const summary = useDashboardSummary()
  const [funnelJob, setFunnelJob] = useState('')
  const funnel = useFunnel(funnelJob || undefined)
  const jobs = useJobList({
    page_size: 100,
    ordering: 'title',
    status: ['open', 'on_hold', 'closed'],
  })
  const recent = useRecentActivity()
  const top = useTopCandidates()
  const upcoming = useUpcomingInterviews()
  const firstName = user?.first_name || user?.full_name?.split(' ')[0] || 'there'
  const empty =
    summary.isSuccess &&
    summary.data.active_jds.value === 0 &&
    summary.data.total_candidates.value === 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${greeting()}, ${firstName} · ${formatDate(new Date())}`}
        breadcrumbs={[{ label: 'Dashboard' }]}
      />
      {empty ? (
        <EmptyState
          icon={SparklesIcon}
          title="Create your first Job Description"
          description="Once a role is open you can search candidates, shortlist them and track every step here."
          action={
            <Button asChild>
              <Link to="/jobs/new">Create Job Description</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {summary.isPending ? (
            <SkeletonMetricRow count={8} />
          ) : summary.isError ? (
            <ErrorState
              title="Couldn't load the summary"
              error={summary.error}
              onRetry={() => void summary.refetch()}
            />
          ) : (
            <div
              role="group"
              className="grid grid-cols-2 gap-3 md:grid-cols-4 2xl:grid-cols-8"
              aria-label="Summary metrics"
            >
              {METRICS.map((metric) => (
                <MetricCard
                  key={metric.key}
                  label={metric.label}
                  value={summary.data[metric.key].value}
                  delta={summary.data[metric.key].delta}
                  deltaLabel="vs last 7 days"
                  icon={metric.icon}
                  to={metric.to}
                />
              ))}
            </div>
          )}
          {/* Grid children default to min-width:auto; min-w-0 keeps the 2fr track from growing past its share. */}
          <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
            <div className="min-w-0 space-y-6">
              <Widget
                title="Recruitment funnel"
                action={
                  <span
                    className="inline-flex min-w-0"
                    title={jobs.isError ? "Couldn't load job descriptions" : undefined}
                  >
                    <Select
                      value={funnelJob || 'all'}
                      onValueChange={(value) => setFunnelJob(value === 'all' ? '' : value)}
                      disabled={jobs.isError}
                    >
                      <SelectTrigger
                        size="sm"
                        aria-label="Funnel job description"
                        className="max-w-56"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent align="end">
                        <SelectItem value="all">All JDs</SelectItem>
                        {(jobs.data?.results ?? []).map((job) => (
                          <SelectItem key={job.id} value={job.id}>
                            {job.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </span>
                }
              >
                {funnel.isPending ? (
                  <SkeletonCard lines={6} />
                ) : funnel.isError ? (
                  <ErrorState
                    title="Couldn't load the funnel"
                    error={funnel.error}
                    onRetry={() => void funnel.refetch()}
                  />
                ) : (
                  <FunnelChart stages={funnel.data.stages} />
                )}
              </Widget>
              <Widget
                title="Recent activity"
                action={
                  <Link
                    to="/jobs"
                    className="shrink-0 text-small font-medium text-primary hover:underline"
                  >
                    View all
                  </Link>
                }
              >
                {recent.isPending ? (
                  <SkeletonTimeline items={5} />
                ) : recent.isError ? (
                  <ErrorState
                    title="Couldn't load activity"
                    error={recent.error}
                    onRetry={() => void recent.refetch()}
                  />
                ) : recent.data.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={HistoryIcon}
                    title="No activity yet"
                    description="Every change on a job description and its candidates shows up here."
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link to="/jobs">View job descriptions</Link>
                      </Button>
                    }
                  />
                ) : (
                  <Timeline items={recent.data.slice(0, 10)} groupByDay={false} />
                )}
              </Widget>
            </div>
            <div className="min-w-0 space-y-6">
              <Widget
                title="Top candidates"
                action={
                  <Link
                    to="/candidates"
                    className="shrink-0 text-small font-medium text-primary hover:underline"
                  >
                    View all
                  </Link>
                }
              >
                {top.isPending ? (
                  <WidgetRowsSkeleton rows={6} avatars label="Loading top candidates" />
                ) : top.isError ? (
                  <ErrorState
                    title="Couldn't load candidates"
                    error={top.error}
                    onRetry={() => void top.refetch()}
                  />
                ) : top.data.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={SparklesIcon}
                    title="No scored candidates yet"
                    description="Search candidates for an open role and the best matches appear here."
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link to="/search">Search candidates</Link>
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line" aria-label="Top candidates">
                    {top.data.map((row, index) => (
                      <li key={row.id}>
                        <StaggerItem index={index} className="min-w-0">
                          <Link
                            to={candidateHref(row)}
                            data-slot="top-candidate"
                            className="flex min-w-0 items-center gap-3 py-2.5 hover:bg-surface-2"
                          >
                            {row.match && <MatchRing value={row.match.overall_pct} size="sm" />}
                            <Avatar
                              name={row.candidate.full_name}
                              src={row.candidate.avatar_url}
                              size="sm"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-small font-medium text-ink">
                                {row.candidate.full_name}
                              </span>
                              <span className="block truncate text-caption text-ink-subtle">
                                {row.job.title}
                              </span>
                            </span>
                            <StatusBadge status={row.status} size="sm" />
                          </Link>
                        </StaggerItem>
                      </li>
                    ))}
                  </ul>
                )}
              </Widget>
              <Widget
                title="Upcoming interviews"
                action={
                  <Link
                    to="/interviews"
                    className="shrink-0 text-small font-medium text-primary hover:underline"
                  >
                    View all
                  </Link>
                }
              >
                {upcoming.isPending ? (
                  <WidgetRowsSkeleton rows={4} label="Loading upcoming interviews" />
                ) : upcoming.isError ? (
                  <ErrorState
                    title="Couldn't load interviews"
                    error={upcoming.error}
                    onRetry={() => void upcoming.refetch()}
                  />
                ) : upcoming.data.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon={CalendarClockIcon}
                    title="Nothing scheduled"
                    description="Interviews appear here as soon as they are booked."
                    action={
                      <Button asChild variant="outline" size="sm">
                        <Link to="/interviews">All interviews</Link>
                      </Button>
                    }
                  />
                ) : (
                  <ul className="divide-y divide-line" aria-label="Upcoming interviews">
                    {upcoming.data.map((interview, index) => (
                      <li key={interview.id} data-slot="upcoming-interview">
                        <StaggerItem
                          index={index}
                          className="flex min-w-0 items-center gap-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-small text-ink">
                              <span className="font-medium">
                                {formatWhen(interview.scheduled_at)}
                              </span>
                              <span className="text-ink-subtle"> · {interview.round_label} · </span>
                              <Link
                                to={candidateHrefFor(interview)}
                                className="font-medium hover:underline"
                              >
                                {interview.application.candidate.full_name}
                              </Link>
                            </p>
                            <div className="mt-0.5 flex min-w-0 items-center gap-2 text-caption text-ink-subtle">
                              <UserChip user={personFromUser(interview.interviewer)} />
                              <span className="min-w-0 truncate">
                                · {interview.application.job.title}
                              </span>
                            </div>
                          </div>
                          {canJoin(interview) && (
                            <Button asChild size="xs" variant="outline">
                              <a
                                href={interview.meeting_link ?? '#'}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Join <ExternalLinkIcon data-icon="inline-end" aria-hidden="true" />
                              </a>
                            </Button>
                          )}
                        </StaggerItem>
                      </li>
                    ))}
                  </ul>
                )}
              </Widget>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
