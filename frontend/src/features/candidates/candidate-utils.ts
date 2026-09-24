import type {
  ApplicationStatus,
  CandidateApplication,
  CandidateRow,
  CandidateSkill,
} from '@/types/domain'
import { ORDER } from '@/features/applications/pipeline-target'

/**
 * The stage stepper of plan.md 9.10. A step ends at `key`; the statuses between two
 * steps (contact_pending, contacted, hr_interview, final_interview, onboarding) are
 * shown as the step that follows them.
 */
export const STAGES: { key: ApplicationStatus; label: string }[] = [
  { key: 'new', label: 'Candidate Added' },
  { key: 'ai_shortlisted', label: 'AI Matched' },
  { key: 'hr_review', label: 'Shortlisted' },
  { key: 'phone_screening', label: 'Phone Screening' },
  { key: 'interview_scheduled', label: 'Interview Scheduled' },
  { key: 'technical_interview', label: 'Technical Assessment' },
  { key: 'selected', label: 'Pre-Offer' },
  { key: 'offer_sent', label: 'Offer Rolled Out' },
  { key: 'offer_accepted', label: 'Offer Accepted' },
  { key: 'onboarded', label: 'Hired' },
]

export const TRAY_STATUSES = new Set<string>(['rejected', 'withdrawn', 'on_hold'])

export function stageIndex(status: string): number {
  const position = ORDER.indexOf(status)
  return position < 0 ? -1 : STAGES.findIndex((stage) => ORDER.indexOf(stage.key) >= position)
}

/** "Strong match" / "Good match" / "Partial match" wording for the analysis card. */
export function matchVerdict(pct: number): string {
  if (pct >= 85) return 'Strong match for this role'
  if (pct >= 70) return 'Good match with some gaps'
  if (pct >= 50) return 'Partial match'
  return 'Weak match for this role'
}

export const PROFICIENCY_LABELS: Record<number, string> = {
  5: 'Expert',
  4: 'Advanced',
  3: 'Proficient',
  2: 'Working',
  1: 'Beginner',
}

/** Skills grouped by proficiency, expert first, for the Profile tab. */
export function groupSkills(skills: readonly CandidateSkill[]) {
  const groups = new Map<number, CandidateSkill[]>()
  for (const skill of skills)
    groups.set(skill.proficiency, [...(groups.get(skill.proficiency) ?? []), skill])
  return [5, 4, 3, 2, 1]
    .filter((level) => groups.has(level))
    .map((level) => ({ level, label: PROFICIENCY_LABELS[level], skills: groups.get(level) ?? [] }))
}

export const EXPERIENCE_BANDS = [
  { key: 'any', label: 'Any experience', min: undefined, max: undefined },
  { key: '0-2', label: '0–2 yrs', min: 0, max: 2 },
  { key: '2-5', label: '2–5 yrs', min: 2, max: 5 },
  { key: '5-8', label: '5–8 yrs', min: 5, max: 8 },
  { key: '8+', label: '8+ yrs', min: 8, max: undefined },
] as const

export type ExperienceBandKey = (typeof EXPERIENCE_BANDS)[number]['key']

export const CANDIDATE_SORT_OPTIONS = [
  { key: '-last_activity', label: 'Recent activity' },
  { key: 'full_name', label: 'Name' },
  { key: '-total_experience_years', label: 'Experience' },
  { key: '-created_at', label: 'Newest' },
] as const

/** True when the API masked the value for this viewer (plan.md 6.9). */
export function isMasked(value: string | null | undefined): boolean {
  return Boolean(value && (value.includes('***') || /x{2,}/i.test(value)))
}

/** Ingested resumes without contact details get a `resume-<hash>@no-email.invalid` key. */
export function isPlaceholderEmail(value: string | null | undefined): boolean {
  return Boolean(value && value.endsWith('@no-email.invalid'))
}

/** The application to open a candidate in: the `?jd=` one, else the most recently active. */
export function pickContext(
  applications: readonly CandidateApplication[],
  jobId: string | undefined,
): CandidateApplication | undefined {
  if (jobId) {
    const wanted = applications.find((application) => application.job_description === jobId)
    if (wanted) return wanted
  }
  return [...applications].sort((a, b) => b.last_activity_at.localeCompare(a.last_activity_at))[0]
}

export function candidateRowHref(row: CandidateRow): string {
  const context = pickContext(row.applications, undefined)
  return context ? `/candidates/${row.id}?jd=${context.job_description}` : `/candidates/${row.id}`
}

/** "₹18,00,000" style annual amounts for the Details card. */
export function formatCtc(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Was this resume parsed by a model?
 *
 * Every document ingested today carries `"llm_pdf"` (the model read the PDF
 * file itself). Rows from the earlier text pipeline still hold `"heuristic"`
 * (regex only) or `"llm"` (the model refined a text digest) until they are
 * re-ingested. One predicate rather than an equality test in every view, so
 * the badge does not silently vanish on a document the AI did read.
 */
export function parsedWithAi(parseSource: string): boolean {
  return parseSource.startsWith('llm')
}
