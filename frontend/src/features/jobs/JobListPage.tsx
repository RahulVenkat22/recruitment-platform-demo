import type { ColumnDef } from '@tanstack/react-table'
import { BriefcaseIcon, PlusIcon, SearchXIcon } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { AvatarGroup } from '@/components/shared/AvatarGroup'
import { rowActionsColumn } from '@/components/shared/data-table-columns'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { StaggerItem } from '@/components/shared/Stagger'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useJobFacets, useJobList } from '@/features/jobs/api'
import { JobCard } from '@/features/jobs/JobCard'
import {
  CLEARED_FILTERS,
  hasActiveFilters,
  JOB_LIST_SPEC,
  paramFromSorting,
  sortingFromParam,
} from '@/features/jobs/job-list-state'
import { canCreateJob } from '@/features/jobs/job-permissions'
import { employmentTypeLabel, previewPeople, workModeLabel } from '@/features/jobs/job-utils'
import { JobListToolbar } from '@/features/jobs/JobListToolbar'
import { JobUploadPanel } from '@/features/jobs/JobUploadPanel'
import { PipelineCounts } from '@/features/jobs/PipelineCounts'
import type { RowAction } from '@/components/shared/ActionMenu'
import { useJobActions } from '@/features/jobs/useJobActions'
import { useJobWorkActions } from '@/features/home/useJobWorkActions'
import { useAuthStore } from '@/lib/auth-store'
import { formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { useIsMobile, useUrlState } from '@/lib/hooks'
import { useUiStore, type PageSize } from '@/lib/ui-store'
import { personFromUser, type JobRow } from '@/types/domain'

/** plan.md 9.4: the Job Descriptions list with table and card views. */
export default function JobListPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const pageSize = useUiStore((state) => state.pageSize)
  const setPageSize = useUiStore((state) => state.setPageSize)
  const mobile = useIsMobile()
  const [state, setState] = useUrlState(JOB_LIST_SPEC)
  const view = mobile ? 'cards' : state.view

  const list = useJobList({
    page: state.page,
    page_size: pageSize,
    search: state.q,
    status: state.status,
    department: state.department,
    location: state.location,
    employment_type: state.type,
    work_mode: state.mode,
    mine: state.mine,
    ordering: state.sort,
  })
  const facets = useJobFacets()
  const actions = useJobActions()
  const work = useJobWorkActions()

  /** The row menu: everyday actions and "Add comment", then archive/delete, then "Force close" last. */
  function menuFor(job: JobRow): RowAction[] {
    const items = actions.itemsFor(job)
    const extra = work.itemsFor(job)
    const tail = items.findIndex((item) => item.separatorBefore)
    const cut = tail < 0 ? items.length : tail
    return [...items.slice(0, cut), ...extra.slice(0, 1), ...items.slice(cut), ...extra.slice(1)]
  }
  const filtered = hasActiveFilters(state)
  const canCreate = canCreateJob(user)

  const columns = useMemo<ColumnDef<JobRow, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Title',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              to={`/jobs/${row.original.id}`}
              className="block truncate font-medium text-ink hover:underline"
            >
              {row.original.title}
            </Link>
            <span className="block truncate text-caption text-ink-subtle">
              {row.original.department}
            </span>
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate text-ink">{row.original.location}</span>
            <span className="block text-caption text-ink-subtle">
              {workModeLabel(row.original.work_mode)}
            </span>
          </div>
        ),
      },
      {
        id: 'employment_type',
        header: 'Type',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-ink-muted">
            {employmentTypeLabel(row.original.employment_type)}
          </span>
        ),
      },
      {
        id: 'created_by__first_name',
        header: 'Created by',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-0">
            <UserChip user={personFromUser(row.original.created_by)} />
            <span className="mt-0.5 block pl-8 text-caption text-ink-subtle">
              {formatDate(row.original.created_at)}
            </span>
          </div>
        ),
      },
      {
        id: 'people',
        header: 'People',
        enableSorting: false,
        cell: ({ row }) => <AvatarGroup people={previewPeople(row.original)} size="sm" max={4} />,
      },
      {
        id: 'count_candidates',
        header: 'Pipeline',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => <PipelineCounts counts={row.original.counts} />,
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge status={row.original.status} kind="jd_status" dot />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-caption text-ink-subtle">
                  {formatRelative(row.original.updated_at)}
                </span>
              </TooltipTrigger>
              <TooltipContent>Updated {formatDateTime(row.original.updated_at)}</TooltipContent>
            </Tooltip>
          </div>
        ),
      },
      rowActionsColumn<JobRow>(menuFor, {
        getLabel: (job) => `Actions for ${job.title}`,
      }),
    ],
    // menuFor closes over mutable hook state; the column cells read it at render time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const total = list.data?.count ?? 0
  const rows = list.data?.results ?? []

  const emptyState = filtered ? (
    <EmptyState
      icon={SearchXIcon}
      title="No job descriptions match these filters"
      description="Try a different search or clear the filters to see every job description you have access to."
      action={
        <Button type="button" variant="outline" onClick={() => setState(CLEARED_FILTERS)}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={BriefcaseIcon}
      title="No job descriptions yet"
      description={
        canCreate
          ? 'Create your first job description to start finding and tracking candidates.'
          : 'Job descriptions you are involved in will appear here.'
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
    <JobListToolbar
      state={state}
      onChange={(patch) => setState(patch)}
      facets={facets.data}
      mobile={mobile}
    />
  )

  return (
    <>
      <PageHeader
        title="Job Descriptions"
        subtitle="Every hiring requirement, who is involved and how the pipeline is moving."
        breadcrumbs={[{ label: 'Job Descriptions' }]}
        actions={
          canCreate ? (
            <Button asChild>
              <Link to="/jobs/new">
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                Create New Job Description
              </Link>
            </Button>
          ) : undefined
        }
      />

      {/* The toolbar keeps one tree position across the three branches, so switching
          views (a click or an arrow key on the view toggle) never remounts it and drops focus. */}
      <div className="space-y-4">
        {canCreate && <JobUploadPanel />}
        {toolbar}
        {list.isError ? (
          <ErrorState
            title="Couldn't load job descriptions"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : view === 'table' ? (
          <DataTable<JobRow>
            aria-label="Job descriptions"
            columns={columns}
            data={rows}
            loading={list.isPending || list.isFetching}
            getRowId={(row) => row.id}
            sorting={{
              state: sortingFromParam(state.sort),
              onChange: (sorting) => setState({ sort: paramFromSorting(sorting), page: 1 }),
            }}
            total={total}
            pagination={{
              pageIndex: state.page - 1,
              pageSize,
              onChange: ({ pageIndex, pageSize: nextSize }) => {
                if (nextSize !== pageSize) setPageSize(nextSize as PageSize)
                setState({ page: pageIndex + 1 })
              },
            }}
            onRowClick={(job) => navigate(`/jobs/${job.id}`)}
            emptyState={emptyState}
          />
        ) : (
          <>
            {list.isPending ? (
              <div
                aria-busy="true"
                aria-label="Loading job descriptions"
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
              >
                {Array.from({ length: 6 }, (_, index) => (
                  <SkeletonCard key={index} lines={2} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-card border border-line bg-surface">{emptyState}</div>
            ) : (
              <div
                aria-busy={list.isFetching || undefined}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
              >
                {rows.map((job, index) => (
                  <StaggerItem key={job.id} index={index} className="h-full min-w-0">
                    <JobCard job={job} actions={menuFor(job)} />
                  </StaggerItem>
                ))}
              </div>
            )}
            {total > 0 && (
              <Pagination
                pageIndex={state.page - 1}
                pageSize={pageSize}
                total={total}
                onChange={({ pageIndex, pageSize: nextSize }) => {
                  if (nextSize !== pageSize) setPageSize(nextSize as PageSize)
                  setState({ page: pageIndex + 1 })
                }}
              />
            )}
          </>
        )}
      </div>
      {actions.dialogs}
      {work.dialogs}
    </>
  )
}
