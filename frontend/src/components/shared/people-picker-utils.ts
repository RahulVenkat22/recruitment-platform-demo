import type { ParticipantRole, UserRow } from '@/types/domain'

const MANAGER_TITLE = /\b(manager|lead|head|director|vp|cto|ceo|principal)\b/i

/** plan.md 8.4 PeoplePicker role defaults: HR -> Recruiter, managers -> Hiring Manager, else Interviewer. */
export function defaultRoleFor(
  user: Pick<UserRow, 'department' | 'designation' | 'role'>,
): ParticipantRole {
  if (user.role === 'hr' || user.role === 'hr_admin') return 'recruiter'
  if (/human resources|^hr$|people/i.test(user.department)) return 'recruiter'
  if (MANAGER_TITLE.test(user.designation)) return 'hiring_manager'
  return 'interviewer'
}
