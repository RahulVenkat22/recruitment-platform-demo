import { BriefcaseIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { StackedBar } from '@/features/dashboard/charts/StackedBar'
import { STAGE_COLORS } from '@/features/dashboard/charts/theme'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import {
  ROLE_LIMIT,
  ROLE_STAGES,
  activeRoles,
  inProcess,
  roleSegments,
} from '@/features/dashboard/open-roles-utils'
import { formatRelative } from '@/lib/format'
import type { JobPipelineRow } from '@/types/domain'

/**
 * One row per open role: title, status, what is waiting, and a stacked bar of the
 * candidates being worked, on the same stage colours as the funnel. Hovering the
 * bar lists every stage; the title opens the role.
 */
export function OpenRoles({ jobs }: { jobs: readonly JobPipelineRow[] }) {
  const roles = activeRoles(jobs)
  const max = Math.max(1, ...roles.map(inProcess))

  if (roles.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={BriefcaseIcon}
        title="No open roles"
        description="Publish a job description and its pipeline shows up here."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/jobs">Job descriptions</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      <ul className="divide-y divide-line" aria-label="Open roles">
        {roles.slice(0, ROLE_LIMIT).map((job) => {
          const working = inProcess(job)
          return (
            <li key={job.id} data-slot="open-role" className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Link
                    to={`/jobs/${job.id}`}
                    className="truncate text-small font-medium text-ink hover:underline"
                  >
                    {job.title}
                  </Link>
                  <StatusBadge status={job.status} kind="jd_status" size="sm" dot />
                </div>
                <span className="shrink-0 text-small text-ink tabular-nums">
                  <span className="font-medium">{formatCount(working)}</span>
                  <span className="text-ink-subtle"> in play</span>
                </span>
              </div>
              <p className="mt-0.5 truncate text-caption text-ink-subtle">
                {job.department} · {job.openings} {job.openings === 1 ? 'opening' : 'openings'} ·{' '}
                {formatCount(job.awaiting)} awaiting review
                {job.parked > 0 && ` · ${formatCount(job.parked)} parked`}
                {job.last_activity_at && ` · updated ${formatRelative(job.last_activity_at)}`}
              </p>
              <StackedBar
                className="mt-2"
                segments={roleSegments(job)}
                max={max}
                title={job.title}
                footer={`${formatCount(job.awaiting)} awaiting review · ${formatCount(job.parked)} rejected or on hold`}
              />
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3">
        {ROLE_STAGES.map((stage) => (
          <span
            key={stage.key}
            className="inline-flex items-center gap-1.5 text-caption text-ink-muted"
          >
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[3px]"
              style={{ background: STAGE_COLORS[stage.key] }}
            />
            {stage.label}
          </span>
        ))}
        {roles.length > ROLE_LIMIT && (
          <Link
            to="/jobs?status=open"
            className="ml-auto text-caption font-medium text-primary hover:underline"
          >
            All {roles.length} roles
          </Link>
        )}
      </div>
    </div>
  )
}
