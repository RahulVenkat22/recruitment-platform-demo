import type { SkillChip } from '@/components/shared/SkillChips'
import type { ApplicationRow } from '@/types/domain'

export const STATUS_GROUP_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'interview', label: 'Interview' },
  { key: 'selected', label: 'Selected' },
  { key: 'closed', label: 'Closed' },
] as const

export type StatusGroupKey = (typeof STATUS_GROUP_OPTIONS)[number]['key']

export const APPLICATION_SORT_OPTIONS = [
  { key: '-match__overall_pct', label: 'Match' },
  { key: '-candidate__total_experience_years', label: 'Experience' },
  { key: 'candidate__full_name', label: 'Name' },
  { key: '-last_activity_at', label: 'Recent activity' },
] as const

export const MATCH_FLOOR_OPTIONS = [0, 60, 70, 80, 90] as const

/** Statuses from which "Shortlist" (move to HR Review) makes sense. */
export const SHORTLISTABLE = new Set(['new', 'ai_shortlisted'])

/** "6 yrs" / "6.5 yrs". */
export function formatYears(value: number | string | null | undefined): string {
  const years = Number(value ?? 0)
  if (!Number.isFinite(years)) return ''
  return `${Number.isInteger(years) ? years : years.toFixed(1)} yrs`
}

/**
 * Skill chips for a ranked row (plan.md 9.8): required skills first, matched
 * ones emerald and missing ones rose, then the candidate's other skills.
 */
export function skillChipsFor(row: ApplicationRow, max = 6): SkillChip[] {
  const chips: SkillChip[] = []
  const seen = new Set<string>()
  const match = row.match
  if (match) {
    match.matched_required_skills.forEach((key, index) => {
      seen.add(key)
      chips.push({ name: match.matched_required_skill_names[index] ?? key, matched: true })
    })
    match.missing_required_skills.forEach((key, index) => {
      seen.add(key)
      chips.push({ name: match.missing_required_skill_names[index] ?? key, matched: false })
    })
  }
  for (const skill of row.candidate.skills) {
    if (seen.has(skill.key)) continue
    seen.add(skill.key)
    chips.push({ name: skill.name, proficiency: skill.proficiency })
  }
  return chips.slice(0, Math.max(max, chips.filter((c) => c.matched !== undefined).length))
}

export function candidateHref(row: ApplicationRow): string {
  return `/candidates/${row.candidate.id}?jd=${row.job_description}`
}
