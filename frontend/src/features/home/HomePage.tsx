import type { ColumnDef } from '@tanstack/react-table'
import { ClipboardListIcon, PlusIcon, SearchIcon, SearchXIcon, UserSearchIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ActionMenu } from '@/components/shared/ActionMenu'
import { rowActionsColumn } from '@/components/shared/data-table-columns'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FilterChips } from '@/components/shared/FilterChips'
import { FilterPopover } from '@/components/shared/FilterPopover'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { StaggerItem } from '@/components/shared/Stagger'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CompletionMeter } from '@/features/home/CompletionMeter'
import {
  HOME_CLEARED,
  HOME_SORT_OPTIONS,
  HOME_SPEC,
  NO_WORK_TITLE,
} from '@/features/home/home-utils'
import { useJobWorkActions } from '@/features/home/useJobWorkActions'
import { useJobFacets, useJobList } from '@/features/jobs/api'
import { canCreateJob, isHighLevelUser } from '@/features/jobs/job-permissions'
import { formatLocation } from '@/features/jobs/job-utils'
import { useAuthStore } from '@/lib/auth-store'
import { enumLabel, useEnumMeta, useEnumOptions } from '@/lib/enums'
import { formatDateTime, formatRelative } from '@/lib/format'
import { useDebounce, useIsMobile, useUrlState } from '@/lib/hooks'
import { useUiStore, type PageSize } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { personFromUser, type JobRow, type UserRow } from '@/types/domain'

/** The status chips in the order a recruiter thinks about them. */
const STATUS_ORDER = ['open', 'on_hold', 'draft', 'closed', 'force_closed', 'archived']
const MAX_INTERVIEWERS = 2

function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** The Interviewer cell: the interviewer-role participants, two by name and the rest as a count. */
function Interviewers({ people, compact = false }: { people: UserRow[]; compact?: boolean }) {
  if (people.length === 0) {
    return <span className="text-small text-ink-subtle">Not assigned</span>
  }
  const shown = people.slice(0, compact ? 1 : MAX_INTERVIEWERS)
  const rest = people.length - shown.length
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      {shown.map((person) => (
        <UserChip key={person.id} user={personFromUser(person)} />
      ))}
      {rest > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex h-5 items-center rounded-pill bg-surface-2 px-1.5 text-caption text-ink-muted tabular-nums">
              +{rest}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {people
              .slice(shown.length)
              .map((person) => person.full_name)
              .join(', ')}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}

function UpdatedAt({ value }: { value: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-ink-muted whitespace-nowrap">{formatRelative(value)}</span>
      </TooltipTrigger>
      <TooltipContent>Last update {formatDateTime(value)}</TooltipContent>
    </Tooltip>
  )
}

function RolePill({ role }: { role: string }) {
  return (
    <span className="inline-flex h-5 items-center rounded-pill bg-surface-2 px-2 text-caption text-ink-muted">
      {enumLabel('user_role', role)}
    </span>
  )
}

/** Phone layout: one card per JD with the same six facts as the table row. */
function WorkCard({
  job,
  showCreator,
  actions,
}: {
  job: JobRow
  showCreator: boolean
  actions: ReturnType<typeof useJobWorkActions>
}) {
  const status = useEnumMeta('jd_status', job.status)
  const items = actions.itemsFor(job)
  return (
    <article
      data-slot="work-card"
      className="flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-h3 text-ink">
            <Link to={`/jobs/${job.id}`} className="rounded-control hover:underline">
              {job.title}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-small text-ink-muted">
            {job.department} • {formatLocation(job.location, job.work_mode)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <StatusBadge status={job.status} kind="jd_status" dot />
          {items.length > 0 && <ActionMenu items={items} label={`Actions for ${job.title}`} />}
        </div>
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-small">
        <dt className="text-ink-subtle">Interviewer</dt>
        <dd className="min-w-0">
          <Interviewers people={job.interviewers} compact />
        </dd>
        <dt className="text-ink-subtle">Updated</dt>
        <dd>
          <UpdatedAt value={job.last_activity_at} />
        </dd>
        {showCreator && (
          <>
            <dt className="text-ink-subtle">Created by</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-2">
              <UserChip user={personFromUser(job.created_by)} />
              <RolePill role={job.created_by.role} />
            </dd>
          </>
        )}
      </dl>
      <CompletionMeter value={job.completion_pct} />
      <span className="sr-only">{status.label}</span>
    </article>
  )
}

/**
 * Homepage (Enhancement.md 3): the user's job descriptions as a work overview.
 * Low-level users see only the JDs they created or are involved in; HR admins and
 * HR can switch between "Mine" and everything they are allowed to see, filter by
 * who raised the JD, and act on a row (comment, force close).
 */
export default function HomePage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const highLevel = isHighLevelUser(user)
  const canCreate = canCreateJob(user)
  const mobile = useIsMobile()
  const pageSize = useUiStore((state) => state.pageSize)
  const setPageSize = useUiStore((state) => state.setPageSize)
  const [state, setState] = useUrlState(HOME_SPEC)
  const [draft, setDraft] = useState(state.q)
  const debounced = useDebounce(draft, 300)
  const mineId = useId()
  const actions = useJobWorkActions()
  const facets = useJobFacets()
  const statuses = useEnumOptions('jd_status')

  // Low-level users always see their own work; the toggle exists for HR only.
  const mine = highLevel ? state.mine : true
  const everyone = highLevel && !mine

  useEffect(() => {
    if (debounced !== state.q) setState({ q: debounced, page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const list = useJobList({
    page: state.page,
    page_size: pageSize,
    search: state.q,
    status: state.status,
    mine,
    created_by: everyone ? state.creator : undefined,
    ordering: state.sort,
  })
  const rows = list.data?.results ?? []
  const total = list.data?.count ?? 0
  const filtered = state.q !== '' || state.status.length > 0 || state.creator.length > 0

  const statusChips = useMemo(() => {
    const counts = new Map((facets.data?.statuses ?? []).map((row) => [row.key, row.count]))
    return STATUS_ORDER.filter((key) => statuses.some((option) => option.key === key)).map(
      (key) => ({
        key,
        label: statuses.find((option) => option.key === key)?.label ?? key,
        count: counts.get(key) ?? 0,
      }),
    )
  }, [facets.data, statuses])

  const columns = useMemo<ColumnDef<JobRow, unknown>[]>(() => {
    const defs: ColumnDef<JobRow, unknown>[] = [
      {
        id: 'title',
        header: 'JD',
        enableSorting: true,
        meta: { className: 'min-w-64' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              to={`/jobs/${row.original.id}`}
              className="block truncate font-medium text-ink hover:underline"
            >
              {row.original.title}
            </Link>
            <span className="block truncate text-caption text-ink-subtle">
              {row.original.department} •{' '}
              {formatLocation(row.original.location, row.original.work_mode)}
            </span>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.status} kind="jd_status" dot />,
      },
      {
        id: 'interviewer',
        header: 'Interviewer',
        enableSorting: false,
        meta: { className: 'min-w-44' },
        cell: ({ row }) => <Interviewers people={row.original.interviewers} />,
      },
      {
        id: 'last_activity_at',
        header: 'Latest update time',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => <UpdatedAt value={row.original.last_activity_at} />,
      },
      {
        id: 'completion',
        header: '% Completed',
        enableSorting: false,
        meta: { className: 'w-44' },
        cell: ({ row }) => <CompletionMeter value={row.original.completion_pct} />,
      },
    ]
    if (everyone) {
      defs.push({
        id: 'created_by__first_name',
        header: 'Created by',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <UserChip user={personFromUser(row.original.created_by)} />
            <RolePill role={row.original.created_by.role} />
          </div>
        ),
      })
    }
    if (highLevel) {
      defs.push(
        rowActionsColumn<JobRow>((job) => actions.itemsFor(job), {
          getLabel: (job) => `Actions for ${job.title}`,
        }),
      )
    }
    return defs
    // itemsFor closes over dialog state; the cells read it at render time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [everyone, highLevel])

  const clearFilters = () => {
    setDraft('')
    setState(HOME_CLEARED)
  }

  const emptyState: ReactNode = filtered ? (
    <EmptyState
      icon={SearchXIcon}
      title="No job descriptions match these filters"
      description="Try a different search, or clear the filters to see all of your work."
      action={
        <Button type="button" variant="outline" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={ClipboardListIcon}
      title={NO_WORK_TITLE}
      description={
        canCreate
          ? 'Create a job description, or get added to one, and it will appear here with its progress.'
          : 'Job descriptions you are added to will appear here with their progress.'
      }
      action={
        canCreate ? (
          <Button asChild>
            <Link to="/jobs/new">
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              Create Job Description
            </Link>
          </Button>
        ) : undefined
      }
    />
  )

  const toolbar = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          aria-label="Status"
          options={statusChips}
          selected={state.status}
          onChange={(status) => setState({ status, page: 1 })}
        />
        {highLevel && (
          <div className="ml-auto inline-flex h-8 items-center gap-2 rounded-control border border-line bg-surface px-2.5">
            <Switch
              id={mineId}
              size="sm"
              checked={state.mine}
              onCheckedChange={(next) => setState({ mine: next, creator: [], page: 1 })}
            />
            <Label htmlFor={mineId} className="text-small font-normal text-ink-muted">
              Mine
            </Label>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            aria-label="Search your job descriptions"
            placeholder="Search by title, department or skill…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="bg-surface pl-8"
          />
        </div>
        {everyone && (
          <FilterPopover
            label="Creator"
            options={facets.data?.creators ?? []}
            selected={state.creator}
            onChange={(creator) => setState({ creator, page: 1 })}
            searchable
            emptyLabel="No matching people"
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          {filtered && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-ink-muted"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
          <Select value={state.sort} onValueChange={(sort) => setState({ sort, page: 1 })}>
            <SelectTrigger size="sm" aria-label="Sort" className="bg-surface">
              <span className="text-ink-subtle">Sort:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {HOME_SORT_OPTIONS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  const firstName = user?.first_name || user?.full_name?.split(' ')[0] || 'there'

  return (
    <>
      <PageHeader
        title="Homepage"
        subtitle={`${greeting()}, ${firstName}. ${
          everyone
            ? 'Every job description you are allowed to see, and how far each recruitment has come.'
            : 'Your job descriptions, and how far each recruitment has come.'
        }`}
        breadcrumbs={[{ label: 'Homepage' }]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/search">
                <UserSearchIcon data-icon="inline-start" aria-hidden="true" />
                Search Candidates
              </Link>
            </Button>
            {canCreate && (
              <Button asChild>
                <Link to="/jobs/new">
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  Create Job Description
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="space-y-4">
        {toolbar}
        {list.isError ? (
          <ErrorState
            title="Couldn't load your job descriptions"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : mobile ? (
          <>
            {list.isPending ? (
              <div aria-busy="true" aria-label="Loading job descriptions" className="space-y-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <SkeletonCard key={index} lines={2} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-card border border-line bg-surface">{emptyState}</div>
            ) : (
              <div aria-busy={list.isFetching || undefined} className="space-y-3">
                {rows.map((job, index) => (
                  <StaggerItem key={job.id} index={index}>
                    <WorkCard job={job} showCreator={everyone} actions={actions} />
                  </StaggerItem>
                ))}
              </div>
            )}
            {total > 0 && (
              <Pagination
                pageIndex={state.page - 1}
                pageSize={pageSize}
                total={total}
                onChange={({ pageIndex, pageSize: next }) => {
                  if (next !== pageSize) setPageSize(next as PageSize)
                  setState({ page: pageIndex + 1 })
                }}
              />
            )}
          </>
        ) : (
          <DataTable<JobRow>
            aria-label="Your job descriptions"
            columns={columns}
            data={rows}
            loading={list.isPending || list.isFetching}
            getRowId={(row) => row.id}
            sorting={{
              state: state.sort
                ? [{ id: state.sort.replace(/^-/, ''), desc: state.sort.startsWith('-') }]
                : [],
              onChange: (sorting) => {
                const [first] = sorting
                setState({
                  sort: first ? `${first.desc ? '-' : ''}${first.id}` : '-last_activity_at',
                  page: 1,
                })
              },
            }}
            total={total}
            pagination={{
              pageIndex: state.page - 1,
              pageSize,
              onChange: ({ pageIndex, pageSize: next }) => {
                if (next !== pageSize) setPageSize(next as PageSize)
                setState({ page: pageIndex + 1 })
              },
            }}
            onRowClick={(job) => navigate(`/jobs/${job.id}`)}
            emptyState={emptyState}
            className={cn(list.isPending && 'min-h-40')}
          />
        )}
      </div>
      {actions.dialogs}
    </>
  )
}
