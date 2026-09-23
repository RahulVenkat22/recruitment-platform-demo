import type { Segment } from '@/features/dashboard/charts/StackedBar'
import { STAGE_COLORS } from '@/features/dashboard/charts/theme'
import type { JobPipelineRow } from '@/types/domain'

/** The stages a candidate in play can be at, in pipeline order, on the funnel's colours. */
export const ROLE_STAGES: readonly { key: keyof JobPipelineRow & string; label: string }[] = [
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'interviewed', label: 'Interviewing' },
  { key: 'selected', label: 'Selected' },
  { key: 'onboarded', label: 'Onboarding' },
]

export const ROLE_LIMIT = 6

/** Candidates someone is actively working on this role (not awaiting review, not parked). */
export function inProcess(job: JobPipelineRow): number {
  return ROLE_STAGES.reduce((sum, stage) => sum + Number(job[stage.key]), 0)
}

export function roleSegments(job: JobPipelineRow): Segment[] {
  return ROLE_STAGES.map((stage) => ({
    key: stage.key,
    label: stage.label,
    value: Number(job[stage.key]),
    color: STAGE_COLORS[stage.key],
  }))
}

/** The roles being hired for, busiest first. */
export function activeRoles(jobs: readonly JobPipelineRow[]): JobPipelineRow[] {
  return jobs
    .filter((job) => job.status === 'open' || job.status === 'on_hold')
    .sort((a, b) => inProcess(b) - inProcess(a) || b.total - a.total)
}
