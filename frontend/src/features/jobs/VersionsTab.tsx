import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { GitCompareIcon, HistoryIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { useJobVersions } from '@/features/jobs/api'
import { VersionSheet } from '@/features/jobs/VersionSheet'
import { formatDateTime } from '@/lib/format'
import { param, useUrlState } from '@/lib/hooks'
import { personFromUser, type JobDetail, type JobVersion } from '@/types/domain'

const VERSION_SPEC = { version: param.number(0) }

/** The value a column sorts on; the list is small and unpaginated, so it is sorted here. */
function sortValue(version: JobVersion, column: string): number | string {
  switch (column) {
    case 'version':
      return version.version
    case 'created_by':
      return version.created_by?.full_name ?? ''
    case 'created_at':
      return version.created_at
    default:
      return version.change_summary
  }
}

/** plan.md 9.6 Versions tab: one row per version with View and Compare actions. */
export function VersionsTab({ job }: { job: JobDetail }) {
  const versions = useJobVersions(job.id)
  // "View version N" links from the timeline arrive as ?version=N and open the sheet directly.
  const [{ version: linkedVersion }, setUrl] = useUrlState(VERSION_SPEC)
  const [localViewing, setViewing] = useState<number | null>(null)
  const [compareWith, setCompareWith] = useState<number | null>(null)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'version', desc: true }])
  const viewing = localViewing ?? (linkedVersion > 0 ? linkedVersion : null)

  const rows = useMemo(() => {
    const list = versions.data ?? []
    const [first] = sorting
    if (!first) return list
    return [...list].sort((a, b) => {
      const left = sortValue(a, first.id)
      const right = sortValue(b, first.id)
      const order =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right))
      return first.desc ? -order : order
    })
  }, [versions.data, sorting])

  const columns = useMemo<ColumnDef<JobVersion, unknown>[]>(
    () => [
      {
        id: 'version',
        header: 'Version',
        enableSorting: true,
        sortDescFirst: true,
        meta: { className: 'w-40' },
        cell: ({ row }) => (
          <span className="font-medium text-ink tabular-nums">
            v{row.original.version}
            {row.original.is_current && (
              <span className="ml-2 inline-flex h-5 items-center rounded-pill bg-primary-soft px-2 text-caption text-primary">
                Current
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'created_by',
        header: 'Changed by',
        enableSorting: true,
        cell: ({ row }) =>
          row.original.created_by ? (
            <UserChip user={personFromUser(row.original.created_by)} />
          ) : (
            <span className="text-ink-subtle">System</span>
          ),
      },
      {
        id: 'created_at',
        header: 'When',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <span className="text-ink-muted tabular-nums">
            {formatDateTime(row.original.created_at)}
          </span>
        ),
      },
      {
        id: 'change_summary',
        header: 'Summary',
        enableSorting: true,
        meta: { className: 'max-w-md truncate' },
        cell: ({ row }) =>
          row.original.change_summary || <span className="text-ink-subtle">—</span>,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: { className: 'w-56 text-right' },
        cell: ({ row }) => (
          <div className="inline-flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCompareWith(null)
                setViewing(row.original.version)
              }}
            >
              View
            </Button>
            {!row.original.is_current && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setViewing(row.original.version)
                  setCompareWith(job.current_version)
                }}
              >
                <GitCompareIcon data-icon="inline-start" aria-hidden="true" />
                Compare with v{job.current_version}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [job.current_version],
  )

  function close(open: boolean) {
    if (open) return
    setViewing(null)
    setCompareWith(null)
    if (linkedVersion > 0) setUrl({ version: 0 })
  }

  if (versions.isError) {
    return (
      <ErrorState
        title="Couldn't load versions"
        error={versions.error}
        onRetry={() => void versions.refetch()}
      />
    )
  }

  return (
    <div className="space-y-4">
      <DataTable<JobVersion>
        aria-label="Versions"
        columns={columns}
        data={rows}
        loading={versions.isPending}
        getRowId={(row) => row.id}
        sorting={{ state: sorting, onChange: setSorting }}
        skeletonRows={3}
        emptyState={
          <EmptyState
            icon={HistoryIcon}
            title="No versions yet"
            description="Each saved edit to this job description is recorded here."
            size="sm"
          />
        }
      />
      <VersionSheet
        jobId={job.id}
        version={viewing}
        compareWith={compareWith}
        onOpenChange={close}
      />
    </div>
  )
}
