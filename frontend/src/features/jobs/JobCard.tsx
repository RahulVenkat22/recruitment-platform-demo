import { BriefcaseIcon, MapPinIcon } from 'lucide-react'
import { Link } from 'react-router'
import { ActionMenu, type RowAction } from '@/components/shared/ActionMenu'
import { AvatarGroup } from '@/components/shared/AvatarGroup'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  employmentTypeLabel,
  formatExperience,
  formatLocation,
  previewPeople,
} from '@/features/jobs/job-utils'
import { PipelineCounts } from '@/features/jobs/PipelineCounts'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { JobRow } from '@/types/domain'

export interface JobCardProps {
  job: JobRow
  actions: RowAction[]
}

/** plan.md 9.4 card view: title, department, chips, people, pipeline bar, status and an Open button. */
export function JobCard({ job, actions }: JobCardProps) {
  return (
    <article
      data-slot="job-card"
      className="flex h-full min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-card transition-[box-shadow,transform] duration-150 ease-brand hover:-translate-y-px hover:shadow-card-hover"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-h3 text-ink">
            <Link
              to={`/jobs/${job.id}`}
              className="rounded-control hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {job.title}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-small text-ink-muted">{job.department}</p>
        </div>
        <ActionMenu items={actions} label={`Actions for ${job.title}`} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
        <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-surface-2 px-2">
          <MapPinIcon aria-hidden="true" className="size-3" />
          {formatLocation(job.location, job.work_mode)}
        </span>
        <span className="inline-flex h-6 items-center gap-1 rounded-pill bg-surface-2 px-2">
          <BriefcaseIcon aria-hidden="true" className="size-3" />
          {employmentTypeLabel(job.employment_type)}
        </span>
        <span className="inline-flex h-6 items-center rounded-pill bg-surface-2 px-2">
          {formatExperience(job.experience_min_years, job.experience_max_years)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <AvatarGroup people={previewPeople(job)} size="sm" max={4} />
        <PipelineCounts counts={job.counts} />
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status={job.status} kind="jd_status" dot />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate text-caption text-ink-subtle">
                Updated {formatRelative(job.updated_at)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{formatDateTime(job.updated_at)}</TooltipContent>
          </Tooltip>
        </div>
        <Button asChild size="sm">
          <Link to={`/jobs/${job.id}`}>Open</Link>
        </Button>
      </div>
    </article>
  )
}
