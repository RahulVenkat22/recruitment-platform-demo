import {
  CalendarDaysIcon,
  CalendarPlusIcon,
  CalendarXIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  ListIcon,
  SearchIcon,
} from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { addDays, parseISO } from 'date-fns'
import { ClearFiltersButton } from '@/components/shared/ClearFiltersButton'
import { ActionMenu } from '@/components/shared/ActionMenu'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FilterChips } from '@/components/shared/FilterChips'
import { FilterPopover } from '@/components/shared/FilterPopover'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SkeletonTableRows } from '@/components/shared/Skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useApplicationActions } from '@/features/applications/useApplicationActions'
import { useInterviews, type InterviewBucket } from '@/features/interviews/api'
import {
  InterviewCard,
  InterviewStatusPill,
  RecommendationPill,
} from '@/features/interviews/InterviewCard'
import { InterviewsCalendar } from '@/features/interviews/InterviewsCalendar'
import {
  canJoin,
  candidateHrefFor,
  formatScore,
  interviewActions,
  isOpen,
} from '@/features/interviews/interview-utils'
import { useJobList } from '@/features/jobs/api'
import { ApplicationPicker } from '@/features/interviews/ApplicationPicker'
import { useAuthStore } from '@/lib/auth-store'
import { weekKey } from '@/lib/datetime'
import { useEnumOptions } from '@/lib/enums'
import { formatDateTime, formatWhen } from '@/lib/format'
import { ariaSort, directionOf, toggleSort } from '@/components/shared/sort-utils'
import { SortButton } from '@/components/shared/SortButton'
import { param, useDebounce, useIsMobile, useUrlState } from '@/lib/hooks'
import { focusRovingSibling, rovingIndex } from '@/lib/keyboard'
import { useUiStore, type PageSize } from '@/lib/ui-store'
import { useUsersDirectory } from '@/lib/users'
import { cn } from '@/lib/utils'
import { personFromUser, type Interview } from '@/types/domain'

const BUCKETS: { key: InterviewBucket; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'today', label: 'Today' },
  { key: 'pending_feedback', label: 'Awaiting feedback' },
  { key: 'completed', label: 'Completed' },
  { key: 'all', label: 'All' },
]
const BUCKET_KEYS = BUCKETS.map((bucket) => bucket.key)

const VIEWS = [
  { key: 'list', label: 'List', icon: ListIcon },
  { key: 'calendar', label: 'Calendar', icon: CalendarDaysIcon },
] as const

const SPEC = {
  bucket: param.enum<InterviewBucket>('all', BUCKET_KEYS),
  jd: param.string(''),
  who: param.string(''),
  round: param.list<string>([]),
  mine: param.boolean(false),
  q: param.string(''),
  view: param.enum<'list' | 'calendar'>('list', ['list', 'calendar']),
  week: param.string(''),
  /** A column sort chosen in the list; empty means the bucket's own order. */
  sort: param.string(''),
  page: param.number(1),
}

function ExpandedRow({
  id,
  interview,
  actions,
}: {
  id: string
  interview: Interview
  actions: ReturnType<typeof useApplicationActions>
}) {
  return (
    <TableRow id={id} className="bg-surface-2/60 hover:bg-surface-2/60">
      <TableCell colSpan={8} className="p-3 whitespace-normal">
        <InterviewCard interview={interview} actions={actions} />
      </TableCell>
    </TableRow>
  )
}

/** plan.md 9.11 Interviews: bucket tabs, filters, a list with expandable rows, and a week calendar. */
export default function InterviewsPage() {
  const [state, setState] = useUrlState(SPEC)
  const me = useAuthStore((s) => s.user)
  const mobile = useIsMobile()
  const pageSize = useUiStore((s) => s.pageSize)
  const setPageSize = useUiStore((s) => s.setPageSize)
  const [draft, setDraft] = useState(state.q)
  const debounced = useDebounce(draft, 300)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const baseId = useId()
  const mineId = `${baseId}-mine`
  const actions = useApplicationActions()
  const rounds = useEnumOptions('interview_round')
  const jobs = useJobList({
    page_size: 100,
    ordering: 'title',
    status: ['open', 'on_hold', 'draft', 'closed'],
  })
  const directory = useUsersDirectory()
  const interviewers = useMemo(
    () => (directory.data ?? []).filter((user) => user.role !== 'employee'),
    [directory.data],
  )
  const week = state.week || weekKey(new Date())
  // The calendar needs room for seven columns, so phones always get the list.
  const view = mobile ? 'list' : state.view

  const common = {
    job_description: state.jd || undefined,
    interviewer: state.who || undefined,
    round: state.round,
    mine: state.mine,
    search: debounced,
  }
  // Finished interviews read newest first; everything else in the order it comes up.
  const defaultSort =
    state.bucket === 'completed' || state.bucket === 'all' ? '-scheduled_at' : 'scheduled_at'
  const sort = state.sort || defaultSort
  const list = useInterviews(
    {
      ...common,
      bucket: state.bucket,
      page: state.page,
      page_size: pageSize,
      ordering: sort,
    },
    view === 'list',
  )
  const calendar = useInterviews(
    {
      ...common,
      from: parseISO(week).toISOString(),
      to: addDays(parseISO(week), 7).toISOString(),
      page_size: 100,
      ordering: 'scheduled_at',
    },
    view === 'calendar',
  )
  const rows = list.data?.results ?? []
  const total = list.data?.count ?? 0
  const filtered = Boolean(state.jd || state.who || state.round.length || state.mine || debounced)
  const canSchedule = me?.role === 'hr_admin' || me?.role === 'hr'

  function clearFilters() {
    setDraft('')
    setState({ jd: '', who: '', round: [], mine: false, q: '', page: 1 })
  }

  const toolbar = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          aria-label="Interview buckets"
          options={BUCKETS}
          selected={[state.bucket]}
          onChange={(next) => {
            const chosen = (next.find((key) => key !== state.bucket) ?? 'all') as InterviewBucket
            setState({ bucket: chosen, page: 1 })
            setExpanded(null)
          }}
        />
        {!mobile && (
          <div
            className="ml-auto inline-flex rounded-control border border-line bg-surface-2 p-0.5"
            role="radiogroup"
            aria-label="View"
          >
            {VIEWS.map((option, index) => {
              const checked = view === option.key
              return (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  // Roving tabindex: one tab stop for the group, arrows move between views.
                  tabIndex={checked ? 0 : -1}
                  onClick={() => setState({ view: option.key })}
                  onKeyDown={(event) => {
                    const next = rovingIndex(event.key, index, VIEWS.length)
                    if (next === null) return
                    event.preventDefault()
                    setState({ view: VIEWS[next].key })
                    focusRovingSibling(event.currentTarget.parentElement, next)
                  }}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-caption font-medium',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    checked ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <option.icon aria-hidden="true" className="size-3.5" />
                  {option.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-64">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            aria-label="Search interviews"
            placeholder="Candidate, job description or interviewer…"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              if (state.page !== 1) setState({ page: 1 })
            }}
            className="bg-surface pl-8"
          />
        </div>
        <Select
          value={state.jd || 'all'}
          onValueChange={(value) => setState({ jd: value === 'all' ? '' : value, page: 1 })}
        >
          <SelectTrigger aria-label="Job description" className="w-56 max-sm:w-full">
            <SelectValue placeholder="Job description" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All job descriptions</SelectItem>
            {(jobs.data?.results ?? []).map((job) => (
              <SelectItem key={job.id} value={job.id}>
                {job.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state.who || 'all'}
          onValueChange={(value) => setState({ who: value === 'all' ? '' : value, page: 1 })}
        >
          <SelectTrigger aria-label="Interviewer" className="w-48 max-sm:w-full">
            <SelectValue placeholder="Interviewer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All interviewers</SelectItem>
            {interviewers.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FilterPopover
          label="Round"
          options={rounds.map((option) => ({ key: option.key, label: option.label }))}
          selected={state.round}
          onChange={(next) => setState({ round: next, page: 1 })}
        />
        <div className="inline-flex items-center gap-2">
          <Switch
            id={mineId}
            checked={state.mine}
            onCheckedChange={(checked) => setState({ mine: checked, page: 1 })}
          />
          <label htmlFor={mineId} className="text-small text-ink-muted select-none">
            Mine
          </label>
        </div>
        <ClearFiltersButton active={filtered} onClick={clearFilters} />
      </div>
    </div>
  )

  const sortableHead = (key: string, label: string, className?: string, descFirst = false) => (
    <TableHead aria-sort={ariaSort(directionOf(sort, key))} className={className}>
      <SortButton
        direction={directionOf(sort, key)}
        onClick={() => setState({ sort: toggleSort(sort, key, descFirst), page: 1 })}
      >
        {label}
      </SortButton>
    </TableHead>
  )

  let body: ReactNode
  if (view === 'calendar') {
    body = (
      <InterviewsCalendar
        weekStart={week}
        onWeekChange={(next) => setState({ week: next })}
        interviews={calendar.data?.results ?? []}
        loading={calendar.isPending}
        error={calendar.isError ? calendar.error : undefined}
        onRetry={() => void calendar.refetch()}
      />
    )
  } else if (list.isError) {
    body = (
      <ErrorState
        title="Couldn't load interviews"
        error={list.error}
        onRetry={() => void list.refetch()}
      />
    )
  } else {
    body = (
      <div className="space-y-4">
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <div className="overflow-x-auto">
            <Table aria-label="Interviews" className="min-w-[880px]">
              <TableHeader className="bg-surface-2">
                <TableRow>
                  {/* The bucket's own order is the first direction, so one click reverses it. */}
                  {sortableHead('scheduled_at', 'Date & time', 'w-44', defaultSort.startsWith('-'))}
                  {sortableHead('application__candidate__full_name', 'Candidate')}
                  {sortableHead('application__job_description__title', 'Job description')}
                  {sortableHead('round', 'Round')}
                  {sortableHead('interviewer__first_name', 'Interviewer')}
                  {sortableHead('status', 'Status')}
                  {sortableHead('score', 'Score', 'text-right', true)}
                  <TableHead className="w-40 text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              {list.isPending ? (
                <SkeletonTableRows rows={8} columns={8} />
              ) : (
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="p-0 whitespace-normal">
                        <EmptyState
                          icon={CalendarXIcon}
                          title={
                            filtered ? 'No interviews match these filters' : 'No interviews here'
                          }
                          description={
                            state.bucket === 'upcoming' || state.bucket === 'all'
                              ? 'Schedule one from a candidate page or with the button above.'
                              : 'Try another tab or clear the filters.'
                          }
                          action={
                            filtered ? (
                              <Button variant="outline" onClick={clearFilters}>
                                Clear filters
                              </Button>
                            ) : undefined
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((interview) => {
                      const open = expanded === interview.id
                      const detailsId = `${baseId}-${interview.id}-details`
                      const candidateName = interview.application.candidate.full_name
                      const items = interviewActions(interview, actions)
                      const feedback = items.find((item) => item.key === 'feedback')
                      const awaiting =
                        isOpen(interview) && new Date(interview.scheduled_at) < new Date()
                      return [
                        <TableRow
                          key={interview.id}
                          data-slot="interview-row"
                          data-status={interview.status}
                          data-expanded={open || undefined}
                          className="cursor-pointer"
                          // Clicking anywhere on the row is a convenience; the chevron button is the
                          // accessible control (focusable, aria-expanded, aria-controls).
                          onClick={(event) => {
                            if ((event.target as HTMLElement).closest('a, button, [role="menu"]'))
                              return
                            setExpanded(open ? null : interview.id)
                          }}
                        >
                          <TableCell>
                            <span
                              className="block font-medium text-ink"
                              title={formatDateTime(interview.scheduled_at)}
                            >
                              {formatWhen(interview.scheduled_at)}
                            </span>
                            <span className="text-caption text-ink-subtle">
                              {interview.duration_minutes}m · {interview.mode_label}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Link
                              to={candidateHrefFor(interview)}
                              className="flex items-center gap-2 hover:underline"
                            >
                              <Avatar
                                name={candidateName}
                                src={interview.application.candidate.avatar_url}
                                size="sm"
                              />
                              <span className="font-medium text-ink">{candidateName}</span>
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              to={`/jobs/${interview.application.job_description}`}
                              className="text-ink hover:underline"
                            >
                              {interview.application.job.title}
                            </Link>
                            <span className="mt-0.5 block">
                              <StatusBadge status={interview.application.status} size="sm" />
                            </span>
                          </TableCell>
                          <TableCell>{interview.round_label}</TableCell>
                          <TableCell>
                            <UserChip user={personFromUser(interview.interviewer)} />
                          </TableCell>
                          <TableCell>
                            <InterviewStatusPill
                              status={interview.status}
                              label={awaiting ? 'Awaiting feedback' : interview.status_label}
                            />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            <span className="flex items-center justify-end gap-1.5">
                              {formatScore(interview.score) || (
                                <span className="text-ink-subtle">—</span>
                              )}
                              {interview.recommendation && (
                                <RecommendationPill
                                  value={interview.recommendation}
                                  label={interview.recommendation_label ?? ''}
                                />
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="inline-flex items-center justify-end gap-1">
                              {canJoin(interview) && (
                                <Button asChild size="sm">
                                  <a
                                    href={interview.meeting_link ?? '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Join{' '}
                                    <ExternalLinkIcon data-icon="inline-end" aria-hidden="true" />
                                  </a>
                                </Button>
                              )}
                              {feedback && awaiting && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => feedback.onSelect?.()}
                                >
                                  Submit feedback
                                </Button>
                              )}
                              <ActionMenu
                                items={items}
                                label={`Actions for ${candidateName}'s interview`}
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-expanded={open}
                                aria-controls={open ? detailsId : undefined}
                                aria-label={`Show details for ${candidateName}`}
                                onClick={() => setExpanded(open ? null : interview.id)}
                                className="text-ink-subtle"
                              >
                                <ChevronDownIcon
                                  aria-hidden="true"
                                  className={cn(
                                    'size-4 transition-transform',
                                    open && 'rotate-180',
                                  )}
                                />
                              </Button>
                            </span>
                          </TableCell>
                        </TableRow>,
                        open ? (
                          <ExpandedRow
                            key={`${interview.id}-details`}
                            id={detailsId}
                            interview={interview}
                            actions={actions}
                          />
                        ) : null,
                      ]
                    })
                  )}
                </TableBody>
              )}
            </Table>
          </div>
        </div>
        {total > 0 && (
          <Pagination
            pageIndex={state.page - 1}
            pageSize={pageSize}
            total={total}
            onChange={({ pageIndex, pageSize: size }) => {
              if (size !== pageSize) setPageSize(size as PageSize)
              setState({ page: pageIndex + 1 })
            }}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="Interviews"
        subtitle="Every round across the job descriptions you are involved in."
        breadcrumbs={[{ label: 'Interviews' }]}
        actions={
          canSchedule ? (
            <Button type="button" onClick={() => setPickerOpen(true)}>
              <CalendarPlusIcon data-icon="inline-start" aria-hidden="true" />
              Schedule interview
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-4">
        <div className="mb-5 rounded-card border border-line bg-surface/75 p-4">{toolbar}</div>
        {body}
      </div>
      {actions.dialogs}
      <ApplicationPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPick={(row) => {
          setPickerOpen(false)
          actions.scheduleInterview(row)
        }}
      />
    </>
  )
}
