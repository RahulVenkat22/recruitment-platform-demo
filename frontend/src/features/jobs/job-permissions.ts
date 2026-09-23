import type { JobDetail, JobPermissions, JobRow, SessionUser, UserRole } from '@/types/domain'

/*
 * Client-side mirror of the plan.md 6.9 matrix for list rows, which carry no
 * `permissions` block. The detail endpoint's `permissions` always wins when
 * present; the server enforces everything regardless.
 */

type RowLike = Pick<JobRow, 'created_by' | 'participants_preview'>

function participantRole(user: SessionUser, job: RowLike): string | null {
  return (
    job.participants_preview.find((participant) => participant.user.id === user.id)
      ?.role_in_recruitment ?? null
  )
}

export function canCreateJob(user: SessionUser | null): boolean {
  return user?.role === 'hr_admin' || user?.role === 'hr'
}

export function canEditJob(user: SessionUser | null, job: RowLike): boolean {
  if (!user) return false
  if (user.role === 'hr_admin') return true
  if (user.role !== 'hr') return false
  return job.created_by.id === user.id || participantRole(user, job) === 'owner'
}

export function canDeleteJob(user: SessionUser | null, job: RowLike): boolean {
  if (!user) return false
  if (user.role === 'hr_admin') return true
  return user.role === 'hr' && job.created_by.id === user.id
}

/** Force close: the same people who may edit the JD (Enhancement.md 3). */
export function canForceCloseJob(user: SessionUser | null, job: RowLike): boolean {
  return canEditJob(user, job)
}

/** Comment on the timeline: HR staff who can see the JD (rows are already visibility-scoped). */
export function canCommentJob(user: SessionUser | null): boolean {
  return user?.role === 'hr_admin' || user?.role === 'hr'
}

/** "High-level" roles of Enhancement.md 3: HR admins and HR run recruitment and get the dashboard. */
export const HIGH_LEVEL_ROLES: readonly UserRole[] = ['hr_admin', 'hr']

/** HR admins and HR see every JD they are allowed to, and the dashboard. */
export function isHighLevelUser(user: SessionUser | null): boolean {
  return user !== null && HIGH_LEVEL_ROLES.includes(user.role)
}

export function canWorkPipeline(user: SessionUser | null, job: RowLike): boolean {
  if (!user) return false
  if (user.role === 'hr_admin') return true
  if (user.role !== 'hr') return false
  return job.created_by.id === user.id || participantRole(user, job) !== null
}

export function permissionsOf(user: SessionUser | null, job: JobRow | JobDetail): JobPermissions {
  if ('permissions' in job && job.permissions) return job.permissions
  const edit = canEditJob(user, job)
  return {
    can_edit: edit,
    can_delete: canDeleteJob(user, job),
    can_manage_participants: edit,
    can_work_pipeline: canWorkPipeline(user, job),
    can_manage: canWorkPipeline(user, job),
    can_force_close: canForceCloseJob(user, job),
    can_comment: canCommentJob(user),
  }
}
