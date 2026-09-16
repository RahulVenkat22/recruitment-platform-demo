import { formatCurrencyINR } from '@/lib/format'
import type { JobRow, JobSnapshot, Participant, Person } from '@/types/domain'

/** The subset of a JD that the formatting helpers read; rows, details and snapshots all satisfy it. */
export type JobLike = Pick<
  JobSnapshot,
  | 'department'
  | 'location'
  | 'work_mode'
  | 'employment_type'
  | 'experience_min_years'
  | 'experience_max_years'
  | 'salary_min'
  | 'salary_max'
  | 'salary_currency'
>

export const WORK_MODE_LABELS: Record<string, string> = {
  onsite: 'On-site',
  hybrid: 'Hybrid',
  remote: 'Remote',
}

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  internship: 'Internship',
}

export const JD_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  on_hold: 'On Hold',
  closed: 'Closed',
  force_closed: 'Force Closed',
  archived: 'Archived',
}

export const PARTICIPANT_ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  recruiter: 'Recruiter',
  hiring_manager: 'Hiring Manager',
  interviewer: 'Interviewer',
  observer: 'Observer',
}

export const workModeLabel = (key: string): string => WORK_MODE_LABELS[key] ?? key
export const employmentTypeLabel = (key: string): string => EMPLOYMENT_TYPE_LABELS[key] ?? key
export const participantRoleLabel = (key: string): string => PARTICIPANT_ROLE_LABELS[key] ?? key

/** "4–8 yrs"; "8+ yrs" when min equals max at the top; "Any experience" for 0–0. */
export function formatExperience(min: number, max: number, unit: 'yrs' | 'years' = 'yrs'): string {
  if (min === 0 && max === 0) return 'Any experience'
  if (min === max) return `${min} ${unit}`
  return `${min}–${max} ${unit}`
}

function formatMoney(value: number, currency: string, compact: boolean): string {
  if (currency === 'INR') return formatCurrencyINR(value, { compact })
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    ...(compact ? { notation: 'compact' } : {}),
  })
  try {
    return formatter.format(value)
  } catch {
    return `${currency} ${value.toLocaleString()}`
  }
}

/** "₹18L–₹28L" (compact) or "₹18,00,000 – ₹28,00,000"; empty when neither bound is set. */
export function formatSalaryRange(
  min: number | null | undefined,
  max: number | null | undefined,
  currency = 'INR',
  options: { compact?: boolean } = {},
): string {
  const compact = options.compact ?? true
  const hasMin = typeof min === 'number'
  const hasMax = typeof max === 'number'
  if (!hasMin && !hasMax) return ''
  if (hasMin && hasMax) {
    const separator = compact ? '–' : ' – '
    return `${formatMoney(min, currency, compact)}${separator}${formatMoney(max, currency, compact)}`
  }
  if (hasMin) return `From ${formatMoney(min, currency, compact)}`
  return `Up to ${formatMoney(max as number, currency, compact)}`
}

/** "Chennai (Hybrid)"; remote roles read "Remote" once, not "Remote (Remote)". */
export function formatLocation(location: string, workMode: string): string {
  const mode = workModeLabel(workMode)
  if (!location) return mode
  if (location.trim().toLowerCase() === mode.toLowerCase()) return mode
  return `${location} (${mode})`
}

/** The one-line summary under a JD title (plan.md 9.6 header). */
export function jobSummaryParts(job: JobLike): string[] {
  const parts = [
    job.department,
    formatLocation(job.location, job.work_mode),
    employmentTypeLabel(job.employment_type),
    formatExperience(job.experience_min_years, job.experience_max_years),
  ]
  const salary = formatSalaryRange(job.salary_min, job.salary_max, job.salary_currency)
  if (salary) parts.push(salary)
  return parts.filter(Boolean)
}

export function jobSummaryLine(job: JobLike): string {
  return jobSummaryParts(job).join(' • ')
}

/** One item per non-empty line, leading bullet glyphs stripped. */
export function splitLines(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
}

/** Title-cases a normalised skill key when the API did not send a display name. */
export function skillLabel(key: string): string {
  return key
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

/** Pairs stored keys with their display names, falling back to title case. */
export function skillChips(keys: readonly string[], names?: readonly string[]) {
  return keys.map((key, index) => ({ name: names?.[index] ?? skillLabel(key) }))
}

export function participantPerson(participant: Participant): Person {
  return {
    id: participant.user.id,
    name: participant.user.full_name,
    avatar_url: participant.user.avatar_url,
    designation: `${participant.user.designation} • ${participant.role_label}`,
  }
}

export function participantsToPeople(participants: readonly Participant[]): Person[] {
  return participants.map(participantPerson)
}

export function previewPeople(job: Pick<JobRow, 'participants_preview' | 'participants_count'>) {
  const people = participantsToPeople(job.participants_preview)
  const hidden = job.participants_count - job.participants_preview.length
  // The AvatarGroup renders "+N" from the array length, so pad it with placeholders it never shows.
  for (let index = 0; index < hidden; index += 1) {
    people.push({ id: `hidden-${index}`, name: '' })
  }
  return people
}

/** True when a JD can still be edited in place (archived JDs are read-only until unarchived). */
export function isEditableStatus(status: string): boolean {
  return status !== 'archived'
}

/** Statuses that end the recruitment: no searches, no new candidates (Enhancement.md 3). */
export const ENDED_STATUSES = new Set(['closed', 'force_closed', 'archived'])

/** True while candidates can still be searched for and worked on this JD. */
export function isWorkable(status: string): boolean {
  return status !== 'archived' && status !== 'force_closed'
}

/** Statuses a JD can be force closed from: anything still in play. */
export const FORCE_CLOSABLE = new Set(['draft', 'open', 'on_hold'])

/** The status moves offered from the header menu, per plan.md 6.5 JD rules. */
export function nextStatusOptions(status: string): { key: string; label: string }[] {
  switch (status) {
    case 'draft':
      return [{ key: 'open', label: 'Publish' }]
    case 'open':
      return [
        { key: 'on_hold', label: 'Put on hold' },
        { key: 'closed', label: 'Close' },
      ]
    case 'on_hold':
      return [
        { key: 'open', label: 'Reopen' },
        { key: 'closed', label: 'Close' },
      ]
    case 'closed':
    case 'force_closed':
      return [{ key: 'open', label: 'Reopen' }]
    default:
      return []
  }
}
