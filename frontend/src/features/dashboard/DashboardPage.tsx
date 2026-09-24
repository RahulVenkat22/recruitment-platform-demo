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
import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { ActivityHeatmap } from '@/features/dashboard/ActivityHeatmap'
import { AttentionList } from '@/features/dashboard/AttentionList'
import { ChartCard, DataList } from '@/features/dashboard/ChartCard'
import { DateRangePicker } from '@/features/dashboard/DateRangePicker'
import { Departments } from '@/features/dashboard/Departments'
import { DetailSheet, type DetailRequest } from '@/features/dashboard/DetailSheet'
import { ExperienceMix } from '@/features/dashboard/ExperienceMix'
import { ExportMenu } from '@/features/dashboard/ExportMenu'
import { InterviewOutcomes } from '@/features/dashboard/InterviewOutcomes'
import { MatchBands } from '@/features/dashboard/MatchBands'
import { OffersMix } from '@/features/dashboard/OffersMix'
import { OpenRoles } from '@/features/dashboard/OpenRoles'
import { Outreach } from '@/features/dashboard/Outreach'
import { PipelineHealth } from '@/features/dashboard/PipelineHealth'
import { ScopePicker } from '@/features/dashboard/ScopePicker'
import { SearchStats } from '@/features/dashboard/SearchStats'
import { SkillsDemand } from '@/features/dashboard/SkillsDemand'
import { StatTile } from '@/features/dashboard/StatTile'
import { TeamActivity } from '@/features/dashboard/TeamActivity'
import { UpcomingInterviews } from '@/features/dashboard/UpcomingInterviews'
import {
  useAttention,
  useDashboardSummary,
  useFunnel,
  useInsights,
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
  WEEKDAYS,
  formatDateRange,
  formatPointDate,
  hourLabel,
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
  /** Whether the number counts the window or the present moment; the drawer says which. */
  covers: 'window' | 'now'
  goodDirection?: 'up' | 'down'
}[] = [
  { key: 'open_roles', label: 'Open roles', icon: BriefcaseIcon, covers: 'now' },
  { key: 'in_pipeline', label: 'In pipeline', icon: UsersIcon, covers: 'now' },
  { key: 'new_candidates', label: 'New candidates', icon: UserPlusIcon, covers: 'window' },
  { key: 'interviews', label: 'Interviews', icon: CalendarClockIcon, covers: 'window' },
  { key: 'offers_pending', label: 'Offers pending', icon: FileSignatureIcon, covers: 'now' },
  { key: 'hires', label: 'Hires', icon: RocketIcon, covers: 'window' },
  { key: 'offer_acceptance', label: 'Offer acceptance', icon: HandshakeIcon, covers: 'window' },
  {
    key: 'time_to_hire',
    label: 'Time to hire',
    icon: TimerIcon,
    covers: 'window',
    goodDirection: 'down',
  },
]

/** What the drawer is titled when a tile opens; the acceptance and time tiles list the same offers and hires. */
const TILE_TITLES: Record<MetricKey, string> = {
  open_roles: 'Open roles',
  in_pipeline: 'Candidates in the pipeline',
  new_candidates: 'New candidates',
  interviews: 'Interviews',
  offers_pending: 'Offers pending',
  hires: 'Hires',
  offer_acceptance: 'Offers answered',
  time_to_hire: 'Hires and how long they took',
}

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

/** A "View all" that opens the records in the drawer rather than leaving the page. */
function OpenAll({ onClick, label = 'View all' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-small font-medium text-primary hover:underline"
    >
      {label}
    </button>
  )
}

/**
 * The HR dashboard (plan.md 9.3, redrawn): headline figures with sparklines, the
 * hiring activity trend, what needs attention, pipeline health, the funnel, the
 * open roles, skills demand, match quality, the candidate mix, sources,
 * departments, offers, outreach, interview outcomes, the week's rhythm, search
 * totals, team activity and the next interviews. Three controls scope
 * everything: the window (7, 30 or 90 days, or any two days), and, for HR
 * admins and HR, whose job descriptions to look at (any number of people).
 * Every figure opens the records behind it in a drawer, so nothing leaves the page,
 * and the whole page downloads as an Excel workbook, a CSV or a PDF.
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
  const insights = useInsights(scope)
  const interviews = useInterviewInsights(scope)
  const attention = useAttention(scope)
  const team = useTeam(period)
  const upcoming = useUpcomingInterviews(scope)
  const directory = useUsersDirectory()
  const [detail, setDetail] = useState<DetailRequest | null>(null)

  const names = state.user.flatMap(
    (id) => directory.data?.find((row) => row.id === id)?.full_name ?? [],
  )
  const firstName = user?.first_name || user?.full_name?.split(' ')[0] || 'there'
  const windowLabel = custom ? formatDateRange(state.start, state.end) : `Last ${period.range} days`
  const funnelJob = pipeline.data?.jobs.find((job) => job.id === state.jd)
  const empty =
    state.user.length === 0 &&
    summary.isSuccess &&
    summary.data.open_roles.value === 0 &&
    summary.data.in_pipeline.value === 0 &&
    summary.data.new_candidates.value === 0

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
        <ExportMenu scope={scope} jobId={state.jd || undefined} />
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
        }. Click any figure to see the records behind it without leaving this page.`}
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
                  active={detail?.metric === tile.key}
                  onClick={() =>
                    setDetail({
                      metric: tile.key,
                      title: TILE_TITLES[tile.key],
                      subtitle: tile.covers === 'window' ? windowLabel : 'Right now',
                    })
                  }
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
                {(data) => (
                  <AttentionList
                    counts={data}
                    onSelect={(item) =>
                      setDetail({ metric: item.key, title: item.label, subtitle: 'Right now' })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Pipeline health"
              subtitle="Right now, who is where and for how long"
              busy={busy(insights)}
              table={
                insights.data && (
                  <DataList
                    caption="Pipeline health"
                    columns={['Stage', 'Candidates', 'Avg days', 'Over a week']}
                    rows={insights.data.stages.map((stage) => [
                      stage.label,
                      stage.value,
                      stage.avg_days ?? '—',
                      stage.stuck,
                    ])}
                  />
                )
              }
            >
              <Loaded query={insights} title="Couldn't load the pipeline health" lines={7}>
                {(data) => (
                  <PipelineHealth
                    stages={data.stages}
                    onSelect={(stage) =>
                      setDetail({
                        metric: 'stage',
                        statuses: stage.statuses,
                        title: stage.label,
                        subtitle: 'Right now',
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
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
                    onSelect={(stage) =>
                      setDetail({
                        metric: 'stage',
                        statuses: stage.statuses,
                        jobId: state.jd || undefined,
                        title: `${stage.label} candidates`,
                        subtitle: funnelJob?.title ?? 'All roles',
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="Open roles"
              subtitle="Right now, candidates in play per role"
              busy={busy(pipeline)}
              action={
                <OpenAll
                  onClick={() =>
                    setDetail({ metric: 'open_roles', title: 'Open roles', subtitle: 'Right now' })
                  }
                />
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
                {(data) => (
                  <OpenRoles
                    jobs={data.jobs}
                    onSelect={(job) =>
                      setDetail({
                        metric: 'role',
                        jobId: job.id,
                        title: job.title,
                        subtitle: 'Everyone on this role',
                      })
                    }
                    onSelectAll={() =>
                      setDetail({
                        metric: 'open_roles',
                        title: 'Open roles',
                        subtitle: 'Right now',
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
            <ChartCard
              title="Skills in demand"
              subtitle="What open roles require, and who in the pipeline has it"
              busy={busy(insights)}
              table={
                insights.data && (
                  <DataList
                    caption="Skills in demand"
                    columns={['Skill', 'Roles asking', 'Candidates']}
                    rows={insights.data.skills.map((skill) => [
                      skill.label,
                      skill.roles,
                      skill.candidates,
                    ])}
                  />
                )
              }
            >
              <Loaded query={insights} title="Couldn't load the skills" lines={8}>
                {(data) => (
                  <SkillsDemand
                    skills={data.skills}
                    onSelect={(skill) =>
                      setDetail({
                        metric: 'skill',
                        key: skill.key,
                        title: `Candidates with ${skill.label}`,
                        subtitle: `${skill.roles} open ${skill.roles === 1 ? 'role asks' : 'roles ask'} for it`,
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard
              title="Match quality"
              subtitle="Right now, scored candidates by fit"
              busy={busy(insights)}
              table={
                insights.data && (
                  <DataList
                    caption="Candidates by match score"
                    columns={['Band', 'Candidates']}
                    rows={insights.data.match.bands.map((band) => [band.label, band.value])}
                  />
                )
              }
            >
              <Loaded query={insights} title="Couldn't load the match quality" lines={5}>
                {(data) => (
                  <MatchBands
                    match={data.match}
                    onSelect={(band) =>
                      setDetail({
                        metric: 'match_band',
                        key: band.key,
                        title: `Match ${band.label.toLowerCase()}`,
                        subtitle: 'Scored candidates, best fit first',
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
            <ChartCard
              title="Experience mix"
              subtitle="Right now, candidates by years of experience"
              busy={busy(insights)}
              table={
                insights.data && (
                  <DataList
                    caption="Candidates by experience"
                    columns={['Experience', 'Candidates']}
                    rows={insights.data.experience.map((band) => [band.label, band.value])}
                  />
                )
              }
            >
              <Loaded query={insights} title="Couldn't load the experience mix" lines={5}>
                {(data) => (
                  <ExperienceMix
                    bands={data.experience}
                    onSelect={(band) =>
                      setDetail({
                        metric: 'experience',
                        key: band.key,
                        title: `Candidates with ${band.label.toLowerCase()}`,
                        subtitle: 'Most experienced first',
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
            <ChartCard
              title="AI searches"
              subtitle={`${windowLabel}, what the searches brought in`}
              busy={busy(insights)}
              table={
                insights.data && (
                  <DataList
                    caption="Search totals"
                    columns={['Figure', 'Value']}
                    rows={[
                      ['Searches run', insights.data.searches.runs],
                      ['Profiles found', insights.data.searches.found],
                      ['AI shortlisted', insights.data.searches.shortlisted],
                      ['New to the database', insights.data.searches.new],
                      [
                        'Average search time (s)',
                        insights.data.searches.avg_duration_ms === null
                          ? '—'
                          : Math.round(insights.data.searches.avg_duration_ms / 1000),
                      ],
                    ]}
                  />
                )
              }
            >
              <Loaded query={insights} title="Couldn't load the search totals" lines={5}>
                {(data) => (
                  <SearchStats
                    searches={data.searches}
                    onSelect={() =>
                      setDetail({
                        metric: 'searches',
                        title: 'Searches run',
                        subtitle: windowLabel,
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard
              title="Candidates by source"
              subtitle="Right now, where the pipeline came from"
              busy={busy(pipeline)}
              action={
                <OpenAll
                  onClick={() =>
                    setDetail({
                      metric: 'stage',
                      title: 'Every candidate',
                      subtitle: 'Right now, on every role you can see',
                    })
                  }
                />
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
                {(data) => (
                  <SourceDonut
                    sources={data.sources}
                    onSelect={(source) =>
                      setDetail({
                        metric: 'source',
                        key: source.key,
                        title: `Candidates from ${source.label}`,
                        subtitle: 'Right now',
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
            <ChartCard
              title="Departments"
              subtitle="Right now, open roles and their candidates"
              busy={busy(insights)}
              table={
                insights.data && (
                  <DataList
                    caption="Open roles by department"
                    columns={['Department', 'Roles', 'Openings', 'Candidates']}
                    rows={insights.data.departments.map((row) => [
                      row.label,
                      row.roles,
                      row.openings,
                      row.candidates,
                    ])}
                  />
                )
              }
            >
              <Loaded query={insights} title="Couldn't load the departments" lines={5}>
                {(data) => (
                  <Departments
                    departments={data.departments}
                    onSelect={(department) =>
                      setDetail({
                        metric: 'department',
                        key: department.key,
                        title: `Open roles in ${department.label}`,
                        subtitle: 'Right now',
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
            <ChartCard
              title="Offers"
              subtitle="Right now, and how fast candidates answered"
              busy={busy(insights)}
              table={
                insights.data && (
                  <DataList
                    caption="Offers by status"
                    columns={['Status', 'Offers']}
                    rows={insights.data.offers.statuses.map((row) => [row.label, row.value])}
                  />
                )
              }
            >
              <Loaded query={insights} title="Couldn't load the offers" lines={5}>
                {(data) => (
                  <OffersMix
                    offers={data.offers}
                    onSelect={(status) =>
                      setDetail({
                        metric: 'offer_status',
                        key: status.key,
                        title: `${status.label} offers`,
                        subtitle: 'Right now',
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
            <ChartCard
              title="Outreach"
              subtitle={`${windowLabel}, calls, emails and messages`}
              busy={busy(insights)}
              table={
                insights.data && (
                  <DataList
                    caption="Outreach by channel and outcome"
                    columns={['Channel or outcome', 'Logged']}
                    rows={[
                      ...insights.data.outreach.channels.map((row) => [row.label, row.value]),
                      ...insights.data.outreach.outcomes.map((row) => [
                        `Outcome: ${row.label}`,
                        row.value,
                      ]),
                    ]}
                  />
                )
              }
            >
              <Loaded query={insights} title="Couldn't load the outreach" lines={6}>
                {(data) => (
                  <Outreach
                    outreach={data.outreach}
                    onSelect={(channel) =>
                      setDetail({
                        metric: 'channel',
                        key: channel.key,
                        title: `${channel.label} outreach`,
                        subtitle: windowLabel,
                      })
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
            <ChartCard
              title="Interviews"
              subtitle={`${windowLabel}, outcomes and load`}
              busy={busy(interviews)}
              action={
                <OpenAll
                  onClick={() =>
                    setDetail({ metric: 'interviews', title: 'Interviews', subtitle: windowLabel })
                  }
                />
              }
              table={
                interviews.data && (
                  <DataList
                    caption="Interviews per interviewer"
                    columns={['Interviewer', 'Held', 'Completed', 'Avg score']}
                    rows={interviews.data.interviewers.map((row) => [
                      row.user.full_name,
                      row.total,
                      row.completed,
                      row.avg_score ?? '—',
                    ])}
                  />
                )
              }
            >
              <Loaded query={interviews} title="Couldn't load interview outcomes">
                {(data) => (
                  <InterviewOutcomes
                    insights={data}
                    onSelect={(figure) =>
                      setDetail(
                        figure === 'interviews'
                          ? { metric: 'interviews', title: 'Interviews', subtitle: windowLabel }
                          : {
                              metric: 'feedback_pending',
                              title: 'Interview feedback owed',
                              subtitle: 'Held, but no feedback submitted yet',
                            },
                      )
                    }
                  />
                )}
              </Loaded>
            </ChartCard>
          </div>

          <ChartCard
            title="When the team works"
            subtitle={`${windowLabel}, actions by hour of the day in your time zone`}
            busy={busy(insights)}
            table={
              insights.data && (
                <div className="max-h-80 overflow-auto">
                  <DataList
                    caption="Actions by weekday and hour"
                    columns={['Hour', ...WEEKDAYS]}
                    rows={Array.from({ length: 24 }, (_, hour) => [
                      hourLabel(hour),
                      ...insights.data!.heatmap.map((row) => row[hour]),
                    ])}
                  />
                </div>
              )
            }
          >
            <Loaded query={insights} title="Couldn't load the activity heatmap" lines={7}>
              {(data) => <ActivityHeatmap heatmap={data.heatmap} />}
            </Loaded>
          </ChartCard>

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
                  Calendar
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
      <DetailSheet request={detail} scope={scope} onClose={() => setDetail(null)} />
    </>
  )
}
