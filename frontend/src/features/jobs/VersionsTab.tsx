import { GitCompareIcon, HistoryIcon } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonTableRows } from '@/components/shared/Skeletons'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useJobVersions } from '@/features/jobs/api'
import { VersionSheet } from '@/features/jobs/VersionSheet'
import { formatDateTime } from '@/lib/format'
import { param, useUrlState } from '@/lib/hooks'
import { personFromUser, type JobDetail } from '@/types/domain'

const VERSION_SPEC = { version: param.number(0) }

/** plan.md 9.6 Versions tab: one row per version with View and Compare actions. */
export function VersionsTab({ job }: { job: JobDetail }) {
  const versions = useJobVersions(job.id)
  // "View version N" links from the timeline arrive as ?version=N and open the sheet directly.
  const [{ version: linkedVersion }, setUrl] = useUrlState(VERSION_SPEC)
  const [localViewing, setViewing] = useState<number | null>(null)
  const [compareWith, setCompareWith] = useState<number | null>(null)
  const viewing = localViewing ?? (linkedVersion > 0 ? linkedVersion : null)

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

  const rows = versions.data ?? []

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
        {versions.isSuccess && rows.length === 0 ? (
          <EmptyState
            icon={HistoryIcon}
            title="No versions yet"
            description="Each saved edit to this job description is recorded here."
            size="sm"
          />
        ) : (
          <Table aria-label="Versions" className="min-w-[640px]">
            <TableHeader className="bg-surface-2">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-24 text-caption text-ink-muted uppercase">
                  Version
                </TableHead>
                <TableHead className="text-caption text-ink-muted uppercase">Changed by</TableHead>
                <TableHead className="text-caption text-ink-muted uppercase">When</TableHead>
                <TableHead className="text-caption text-ink-muted uppercase">Summary</TableHead>
                <TableHead className="w-56 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            {versions.isPending ? (
              <SkeletonTableRows rows={3} columns={5} />
            ) : (
              <TableBody>
                {rows.map((version) => (
                  <TableRow key={version.id}>
                    <TableCell className="font-medium text-ink tabular-nums">
                      v{version.version}
                      {version.is_current && (
                        <span className="ml-2 inline-flex h-5 items-center rounded-pill bg-primary-soft px-2 text-caption text-primary">
                          Current
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {version.created_by ? (
                        <UserChip user={personFromUser(version.created_by)} />
                      ) : (
                        <span className="text-ink-subtle">System</span>
                      )}
                    </TableCell>
                    <TableCell className="text-ink-muted tabular-nums">
                      {formatDateTime(version.created_at)}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-ink">
                      {version.change_summary || <span className="text-ink-subtle">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCompareWith(null)
                            setViewing(version.version)
                          }}
                        >
                          View
                        </Button>
                        {!version.is_current && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setViewing(version.version)
                              setCompareWith(job.current_version)
                            }}
                          >
                            <GitCompareIcon data-icon="inline-start" aria-hidden="true" />
                            Compare with v{job.current_version}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        )}
      </div>
      <VersionSheet
        jobId={job.id}
        version={viewing}
        compareWith={compareWith}
        onOpenChange={close}
      />
    </div>
  )
}
