import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import {
  BriefcaseIcon,
  CalendarClockIcon,
  FileSignatureIcon,
  HandshakeIcon,
  RefreshCwIcon,
  RocketIcon,
  SparklesIcon,
  TimerIcon,
  UserPlusIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { SkeletonText } from '@/components/shared/Skeletons'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AttentionList, type AttentionKey } from '@/features/dashboard/AttentionList'
import { ChartCard, DataList } from '@/features/dashboard/ChartCard'
import { DateRangePicker } from '@/features/dashboard/DateRangePicker'
import { InterviewOutcomes } from '@/features/dashboard/InterviewOutcomes'
import { OpenRoles } from '@/features/dashboard/OpenRoles'
import { ScopePicker } from '@/features/dashboard/ScopePicker'
import { StatTile } from '@/features/dashboard/StatTile'
import { TeamActivity } from '@/features/dashboard/TeamActivity'
import { UpcomingInterviews } from '@/features/dashboard/UpcomingInterviews'
import {
  useAttention,
  useDashboardSummary,
  useFunnel,
  useInterviewInsights,
  usePipeline,
  useTeam,
  useTrends,
  useUpcomingInterviews,
  type DashboardScope,
  type DashboardWindow,
} from '@/features/dashboard/api'
import { FunnelChart } from '@/features/dashboard/charts/FunnelChart'
import { SourceDonut } from '@/features/dashboard/charts/SourceDonut'
import { TrendChart } from '@/features/dashboard/charts/TrendChart'
import { TREND_SERIES } from '@/features/dashboard/charts/trend-series'
import {
  DASHBOARD_SPEC,
  RANGE_OPTIONS,
  candidatesHref,
  formatDateRange,
  formatPointDate,
  rangeDays,
  rangeSpan,
  validCustomRange,
  type RangeKey,
} from '@/features/dashboard/dashboard-utils'
import { activeRoles, roleSegments } from '@/features/dashboard/open-roles-utils'
import { teamSegments } from '@/features/dashboard/team-utils'
import { useAuthStore } from '@/lib/auth-store'
import { formatRelative } from '@/lib/format'
import { useUrlState } from '@/lib/hooks'
import { qk } from '@/lib/query-keys'
import { useUsersDirectory } from '@/lib/users'
import type { DashboardSummary } from '@/types/domain'

type MetricKey = Exclude<keyof DashboardSummary, 'range_days'>

const TILES: readonly {
  key: MetricKey
  label: string
  icon: LucideIcon
  to: string
  goodDirection?: 'up' | 'down'
}[] = [
  { key: 'open_roles', label: 'Open roles', icon: BriefcaseIcon, to: '/jobs?status=open' },
  { key: 'in_pipeline', label: 'In pipeline', icon: UsersIcon, to: '/candidates' },
  {
    key: 'new_candidates',
    label: 'New candidates',
    icon: UserPlusIcon,
    to: '/candidates?sort=-created_at',
  },
  { key: 'interviews', label: 'Interviews', icon: CalendarClockIcon, to: '/interviews?bucket=all' },
  {
    key: 'offers_pending',
    label: 'Offers pending',
    icon: FileSignatureIcon,
    to: candidatesHref({ statuses: ['offer_sent'] }),
  },
  {
    key: 'hires',
    label: 'Hires',
    icon: RocketIcon,
    to: candidatesHref({ statuses: ['onboarded'] }),
  },
  {
    key: 'offer_acceptance',
    label: 'Offer acceptance',
    icon: HandshakeIcon,
    to: candidatesHref({ statuses: ['offer_sent', 'offer_accepted'] }),
  },
  {
    key: 'time_to_hire',
    label: 'Time to hire',
    icon: TimerIcon,
    to: candidatesHref({ statuses: ['onboarded'] }),
    goodDirection: 'down',
  },
]

/** "Priya Nair's", "Priya Nair and Arun Kumar's", "Priya Nair and 2 others'". */
function possessive(names: readonly string[]): string {
  if (names.length === 0) return "the chosen people's"
  if (names.length > 2) return `${names[0]} and ${names.length - 1} others'`
  return `${names.join(' and ')}'s`
}

function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** First load shows a placeholder, a failure an inline retry, and everything else the data. */
function Loaded<T>({
  query,
  title,
  lines = 6,
  children,
}: {
  query: UseQueryResult<T>
  title: string
  lines?: number
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <SkeletonText lines={lines} />
  if (query.isError) {
    return (
      <ErrorState
        variant="inline"
        title={title}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    )
  }
  return children(query.data)
}

function busy<T>(query: UseQueryResult<T>): boolean {
  return query.isPlaceholderData || (query.isFetching && !query.isPending)
}

/**
 * The HR dashboard (plan.md 9.3, redrawn): headline figures with sparklines, the
 * hiring activity trend, what needs attention, the funnel, the open roles, the
 * candidate sources, interview outcomes, team activity and the next interviews.
 * Three controls scope everything: the window (7, 30 or 90 days, or any two
 * days), and, for HR admins and HR, whose job descriptions to look at (any
 * number of people).
 */
export default function DashboardPage() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const [state, setState] = useUrlState(DASHBOARD_SPEC)
  const custom = validCustomRange(state.start, state.end)
  const period: DashboardWindow = {
    range: rangeDays(state.range),
    ...(custom ? { start: state.start, end: state.end } : {}),
  }
  const scope: DashboardScope = { ...period, users: state.user }
  const span = custom ? rangeSpan(state.start, state.end) : period.range

  const summary = useDashboardSummary(scope)
  const trends = useTrends(scope)
  const pipeline = usePipeline(scope)
  const funnel = useFunnel(scope, state.jd || undefined)
  const insights = useInterviewInsights(scope)
  const attention = useAttention(scope)
  const team = useTeam(period)
  const upcoming = useUpcomingInterviews(scope)
  const directory = useUsersDirectory()

  const names = state.user.flatMap(
    (id) => directory.data?.find((row) => row.id === id)?.full_name ?? [],
  )
  const firstName = user?.first_name || user?.full_name?.split(' ')[0] || 'there'
  const windowLabel = custom ? formatDateRange(state.start, state.end) : `Last ${period.range} days`
  const empty =
    state.user.length === 0 &&
    summary.isSuccess &&
    summary.data.open_roles.value === 0 &&
    summary.data.in_pipeline.value === 0 &&
    summary.data.new_candidates.value === 0

  const stageStatuses = (key: string) =>
    pipeline.data?.stages.find((stage) => stage.key === key)?.statuses ?? []
  const hrefs: Record<AttentionKey, string> = {
    overdue_follow_ups: candidatesHref({ statuses: stageStatuses('contacted') }),
    feedback_pending: '/interviews?bucket=pending_feedback',
    offers_expiring: candidatesHref({ statuses: ['offer_sent'] }),
    stale_candidates: candidatesHref({
      statuses: ['shortlisted', 'contacted', 'interviewed', 'selected'].flatMap(stageStatuses),
    }),
    quiet_roles: '/jobs?status=open',
  }

  // Navigations commit as transitions, so a second pick made before the first
  // has landed would read a stale URL; the handlers work from the last selection
  // they set instead.
  const latestUsers = useRef<readonly string[]>(state.user)
  useEffect(() => {
    latestUsers.current = state.user
  }, [state.user])
  const setUsers = (ids: readonly string[]) => {
    latestUsers.current = ids
    setState({ user: [...ids], jd: '' })
  }
  const toggleUser = (userId: string) => {
    const ids = latestUsers.current
    setUsers(ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId])
  }
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.dashboard.all })
  const updatedAt = summary.dataUpdatedAt ? formatRelative(new Date(summary.dataUpdatedAt)) : null

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        size="sm"
        aria-label="Window"
        options={RANGE_OPTIONS}
        value={custom ? '' : state.range}
        onChange={(next: RangeKey) => setState({ range: next, start: '', end: '' })}
        className="w-auto bg-surface"
      />
      <DateRangePicker
        start={custom ? state.start : ''}
        end={custom ? state.end : ''}
        onChange={(next) => setState(next ?? { start: '', end: '' })}
      />
      <ScopePicker value={state.user} onToggle={toggleUser} onClear={() => setUsers([])} />
      <div className="ml-auto flex items-center gap-1 text-caption text-ink-subtle">
        {updatedAt && <span>Updated {updatedAt}</span>}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh"
              onClick={refresh}
              className="text-ink-subtle hover:text-ink"
            >
              <RefreshCwIcon
                aria-hidden="true"
                className={summary.isFetching ? 'animate-spin' : undefined}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Refresh every figure</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${greeting()}, ${firstName}. Hiring across ${
          state.user.length > 0
            ? `${possessive(names)} job descriptions`
            : 'every job description you can see'
        }.`}
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
          {toolbar}

          {summary.isError ? (
            <ErrorState
              title="Couldn't load the summary"
              error={summary.error}
              onRetry={() => void summary.refetch()}
            />
          ) : (
            <div
              role="group"
              aria-label="Headline figures"
              aria-busy={busy(summary) || undefined}
              className="grid grid-cols-2 gap-3 transition-opacity duration-150 ease-brand md:grid-cols-4 2xl:grid-cols-8 aria-busy:opacity-60"
            >
              {TILES.map((tile) => (
                <StatTile
                  key={tile.key}
                  label={tile.label}
                  metric={summary.data?.[tile.key]}
                  icon={tile.icon}
                  to={tile.to}
                  goodDirection={tile.goodDirection}
                  rangeDays={span}
                  loading={summary.isPending}
                />
              ))}
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <ChartCard
              title="Hiring activity"
              subtitle={`${windowLabel}, by day`}
              busy={busy(trends)}
              table={
                trends.data && (
                  <div className="max-h-80 overflow-auto">
                    <DataList
                      caption="Hiring activity by day"
                      columns={['Day', ...TREND_SERIES.map((series) => series.label)]}
                      rows={trends.data.points.map((point) => [
                        formatPointDate(point.date),
                        ...TREND_SERIES.map((series) => point[series.key]),
                      ])}
                    />
                  </div>
                )
              }
            >
              <Loaded query={trends} title="Couldn't load the activity trend" lines={8}>
                {(data) => <TrendChart points={data.points} />}
              </Loaded>
            </ChartCard>
            <ChartCard title="Needs attention" subtitle="Right now" busy={busy(attention)}>
              <Loaded query={attention} title="Couldn't load what needs attention" lines={5}>
                {(data) => <AttentionList counts={data} hrefs={hrefs} />}
              </Loaded>
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Recruitment funnel"
              subtitle="Right now, candidates who reached each stage"
              busy={busy(funnel)}
              action={
                <Select
                  value={state.jd || 'all'}
                  onValueChange={(value) => setState({ jd: value === 'all' ? '' : value })}
                  disabled={!pipeline.data}
                >
                  <SelectTrigger size="sm" aria-label="Funnel job description" className="max-w-52">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="all">All roles</SelectItem>
                    {(pipeline.data?.jobs ?? []).map((job) => (
                      <SelectItem key={job.id} value={job.id}>
                        {job.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
              table={
                funnel.data && (
                  <DataList
                    caption="Recruitment funnel"
                    columns={['Stage', 'Candidates', 'Of previous']}
                    rows={funnel.data.stages.map((stage) => [
                      stage.label,
                      stage.value,
                      stage.conversion_pct === null ? '—' : `${stage.conversion_pct}%`,
                    ])}
                  />
                )
              }
            >
              <Loaded query={funnel} title="Couldn't load the funnel">
                {(data) => (
                  <FunnelChart
                    stages={data.stages}
                    hrefFor={(stage) =>
                      candidatesHref({ statuses: stage.statuses, jd: state.jd || undefined })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
            <ChartCard
              title="Open roles"
              subtitle="Right now, candidates in play per role"
              busy={busy(pipeline)}
              action={
                <Link
                  to="/jobs?status=open"
                  className="text-small font-medium text-primary hover:underline"
                >
                  View all
                </Link>
              }
              table={
                pipeline.data && (
                  <DataList
                    caption="Candidates in play per open role"
                    columns={[
                      'Role',
                      'Awaiting',
                      'Shortlisted',
                      'Contacted',
                      'Interviewing',
                      'Selected',
                      'Onboarding',
                      'Parked',
                    ]}
                    rows={activeRoles(pipeline.data.jobs).map((job) => [
                      job.title,
                      job.awaiting,
                      ...roleSegments(job).map((segment) => segment.value),
                      job.parked,
                    ])}
                  />
                )
              }
            >
              <Loaded query={pipeline} title="Couldn't load the open roles">
                {(data) => <OpenRoles jobs={data.jobs} />}
              </Loaded>
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
            <ChartCard
              title="Candidates by source"
              subtitle="Right now, where the pipeline came from"
              busy={busy(pipeline)}
              action={
                <Link
                  to="/candidates"
                  className="text-small font-medium text-primary hover:underline"
                >
                  View all
                </Link>
              }
              table={
                pipeline.data && (
                  <DataList
                    caption="Candidates by source"
                    columns={['Source', 'Candidates']}
                    rows={pipeline.data.sources.map((source) => [source.label, source.value])}
                  />
                )
              }
            >
              <Loaded query={pipeline} title="Couldn't load the sources" lines={4}>
                {(data) => <SourceDonut sources={data.sources} />}
              </Loaded>
            </ChartCard>
            <ChartCard
              title="Interviews"
              subtitle={`${windowLabel}, outcomes and load`}
              busy={busy(insights)}
              action={
                <Link
                  to="/interviews"
                  className="text-small font-medium text-primary hover:underline"
                >
                  View all
                </Link>
              }
              table={
                insights.data && (
                  <DataList
                    caption="Interviews per interviewer"
                    columns={['Interviewer', 'Held', 'Completed', 'Avg score']}
                    rows={insights.data.interviewers.map((row) => [
                      row.user.full_name,
                      row.total,
                      row.completed,
                      row.avg_score ?? '—',
                    ])}
                  />
                )
              }
            >
              <Loaded query={insights} title="Couldn't load interview outcomes">
                {(data) => <InterviewOutcomes insights={data} />}
              </Loaded>
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Team activity"
              subtitle={`${windowLabel}, across everything you can see`}
              busy={busy(team)}
              table={
                team.data && (
                  <DataList
                    caption="Team activity"
                    columns={[
                      'Person',
                      'Roles',
                      'Sourcing',
                      'Outreach',
                      'Interviews',
                      'Closing',
                      'Total',
                    ]}
                    rows={team.data.map((member) => [
                      member.user.full_name,
                      member.roles,
                      ...teamSegments(member).map((segment) => segment.value),
                      member.total,
                    ])}
                  />
                )
              }
            >
              <Loaded query={team} title="Couldn't load team activity">
                {(data) => (
                  <TeamActivity members={data} focused={state.user} onFocus={toggleUser} />
                )}
              </Loaded>
            </ChartCard>
            <ChartCard
              title="Upcoming interviews"
              subtitle="The next five"
              busy={busy(upcoming)}
              action={
                <Link
                  to="/interviews"
                  className="text-small font-medium text-primary hover:underline"
                >
                  View all
                </Link>
              }
            >
              <Loaded query={upcoming} title="Couldn't load interviews" lines={4}>
                {(data) => <UpcomingInterviews interviews={data} />}
              </Loaded>
            </ChartCard>
          </div>
        </div>
      )}
    </>
  )
}
