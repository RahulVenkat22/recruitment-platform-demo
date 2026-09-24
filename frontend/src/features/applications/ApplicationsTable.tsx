import type { ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ActionMenu, type RowAction } from '@/components/shared/ActionMenu'
import { Avatar } from '@/components/shared/Avatar'
import { rowActionsColumn, selectionColumn } from '@/components/shared/data-table-columns'
import {
  DataTable,
  type BulkActionsContext,
  type ControlledState,
} from '@/components/shared/DataTable'
import { MatchRing } from '@/components/shared/MatchRing'
import { Pagination } from '@/components/shared/Pagination'
import type { PaginationState } from '@/components/shared/pagination-utils'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { SkillChips } from '@/components/shared/SkillChips'
import { SourceBadge } from '@/components/shared/SourceBadge'
import { StaggerItem } from '@/components/shared/Stagger'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import {
  candidateHref,
  formatYears,
  skillChipsFor,
} from '@/features/applications/application-utils'
import { useEnumMeta } from '@/lib/enums'
import { cn } from '@/lib/utils'
import type { ApplicationRow } from '@/types/domain'

export interface ApplicationsTableProps {
  rows: ApplicationRow[]
  loading?: boolean
  total: number
  pagination: PaginationState & { onChange: (state: PaginationState) => void }
  sorting?: ControlledState<SortingState>
  view?: 'table' | 'cards'
  /** Added to each row number so ranks continue across pages. */
  rankOffset?: number
  selection?: ControlledState<RowSelectionState>
  bulkActions?: (context: BulkActionsContext<ApplicationRow>) => ReactNode
  actionsFor?: (row: ApplicationRow) => RowAction[]
  /** Show the job description column (global candidate views). */
  showJob?: boolean
  emptyState?: ReactNode
  toolbar?: ReactNode
  className?: string
}

function CandidateCell({ row }: { row: ApplicationRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={row.candidate.full_name} src={row.candidate.avatar_url} size="md" />
      <div className="min-w-0 whitespace-normal">
        <Link to={candidateHref(row)} className="block font-medium text-ink hover:underline">
          {row.candidate.full_name}
        </Link>
        <span className="block text-caption text-ink-subtle">{row.candidate.headline}</span>
      </div>
    </div>
  )
}

function ApplicationCard({ row, actions }: { row: ApplicationRow; actions?: RowAction[] }) {
  const status = useEnumMeta('status', row.status)
  const skills = row.candidate.skills.slice(0, 5).map((skill) => skill.name)
  return (
    <article
      data-slot="application-card"
      className="flex h-full min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card transition-[box-shadow,transform] duration-150 ease-brand hover:-translate-y-px hover:shadow-card-hover"
    >
      <div className="flex items-start gap-3">
        <Avatar name={row.candidate.full_name} src={row.candidate.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="text-h3 break-words text-ink">
            <Link to={candidateHref(row)} className="rounded-control hover:underline">
              {row.candidate.full_name}
            </Link>
          </h3>
          <p className="text-small text-ink-muted">{row.candidate.headline}</p>
        </div>
        {row.match && <MatchRing value={row.match.overall_pct} size="md" />}
      </div>
      <dl className="space-y-1 text-small text-ink-muted">
        <div>
          <dt className="sr-only">Skills</dt>
          <dd className="text-ink">{skills.join(' • ') || 'No skills listed'}</dd>
        </div>
        <div>
          <dt className="sr-only">Experience</dt>
          <dd>{formatYears(row.candidate.total_experience_years)} experience</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt>Sources:</dt>
          <dd>
            <SourceBadge source={row.candidate.sources} />
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt>Status:</dt>
          <dd className="text-ink">{status.label}</dd>
        </div>
      </dl>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4">
        <StatusBadge status={row.status} dot />
        <div className="flex items-center gap-1">
          {actions && (
            <ActionMenu items={actions} label={`Actions for ${row.candidate.full_name}`} />
          )}
          <Button asChild size="sm" variant="outline">
            <Link to={candidateHref(row)}>Open profile</Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

/** The ranked candidate table (plan.md 9.8, 9.6 Candidates tab) with a card view. */
export function ApplicationsTable({
  rows,
  loading = false,
  total,
  pagination,
  sorting,
  view = 'table',
  rankOffset = 0,
  selection,
  bulkActions,
  actionsFor,
  showJob = false,
  emptyState,
  toolbar,
  className,
}: ApplicationsTableProps) {
  const navigate = useNavigate()

  const columns: ColumnDef<ApplicationRow, unknown>[] = [
    ...(selection
      ? [selectionColumn<ApplicationRow>({ getLabel: (row) => row.candidate.full_name })]
      : []),
    {
      id: 'rank',
      header: '#',
      enableSorting: false,
      meta: { className: 'w-10 text-ink-subtle tabular-nums' },
      cell: ({ row }) => rankOffset + row.index + 1,
    },
    {
      id: 'candidate__full_name',
      header: 'Candidate',
      enableSorting: true,
      cell: ({ row }) => <CandidateCell row={row.original} />,
    },
    ...(showJob
      ? [
          {
            id: 'job_description__title',
            header: 'Job description',
            enableSorting: true,
            cell: ({ row }) => (
              <Link
                to={`/jobs/${row.original.job_description}`}
                className="text-ink hover:underline"
              >
                {row.original.job.title}
              </Link>
            ),
          } satisfies ColumnDef<ApplicationRow, unknown>,
        ]
      : []),
    {
      id: 'match__overall_pct',
      header: 'Match',
      enableSorting: true,
      sortDescFirst: true,
      cell: ({ row }) =>
        row.original.match ? (
          <MatchRing value={row.original.match.overall_pct} size="sm" />
        ) : (
          <span className="text-caption text-ink-subtle">Not scored</span>
        ),
    },
    {
      id: 'candidate__total_experience_years',
      header: 'Experience',
      enableSorting: true,
      sortDescFirst: true,
      cell: ({ row }) => (
        <span className="text-ink tabular-nums">
          {formatYears(row.original.candidate.total_experience_years)}
        </span>
      ),
    },
    {
      id: 'skills',
      header: 'Skills',
      enableSorting: false,
      meta: { className: 'min-w-64' },
      cell: ({ row }) => <SkillChips skills={skillChipsFor(row.original)} highlight max={5} />,
    },
    {
      id: 'source',
      header: 'Source',
      enableSorting: false,
      cell: ({ row }) => <SourceBadge source={row.original.candidate.sources} />,
    },
    {
      id: 'status',
      header: 'Status',
      enableSorting: true,
      cell: ({ row }) => <StatusBadge status={row.original.status} dot />,
    },
    ...(actionsFor
      ? [
          rowActionsColumn<ApplicationRow>(actionsFor, {
            getLabel: (row) => `Actions for ${row.candidate.full_name}`,
          }),
        ]
      : []),
  ]

  // The toolbar sits outside the view switch so its controls (the view toggle
  // included) keep their DOM nodes, and keyboard focus, when the view changes.
  return (
    <div data-slot="applications-table" data-view={view} className={cn('space-y-3', className)}>
      {toolbar}
      {view === 'cards' ? (
        <>
          {loading && rows.length === 0 ? (
            <div
              aria-busy="true"
              aria-label="Loading candidates"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {Array.from({ length: 6 }, (_, index) => (
                <SkeletonCard key={index} avatar lines={3} className="min-w-0" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-card border border-line bg-surface">{emptyState}</div>
          ) : (
            <div
              aria-busy={loading || undefined}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {rows.map((row, index) => (
                <StaggerItem key={row.id} index={index} className="h-full min-w-0">
                  <ApplicationCard row={row} actions={actionsFor?.(row)} />
                </StaggerItem>
              ))}
            </div>
          )}
          {total > 0 && <Pagination {...pagination} total={total} />}
        </>
      ) : (
        <DataTable<ApplicationRow>
          aria-label="Candidates"
          columns={columns}
          data={rows}
          loading={loading}
          getRowId={(row) => row.id}
          sorting={sorting}
          total={total}
          pagination={pagination}
          rowSelection={selection}
          bulkActions={bulkActions}
          onRowClick={(row) => navigate(candidateHref(row))}
          emptyState={emptyState}
        />
      )}
    </div>
  )
}
