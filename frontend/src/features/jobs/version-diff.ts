import {
  employmentTypeLabel,
  formatSalaryRange,
  skillLabel,
  splitLines,
  workModeLabel,
} from '@/features/jobs/job-utils'
import type { JobSnapshot } from '@/types/domain'

export type DiffKind = 'scalar' | 'text' | 'lines' | 'list'

export interface FieldDiff {
  key: string
  label: string
  kind: DiffKind
  before: string | string[]
  after: string | string[]
}

interface FieldSpec {
  key: keyof JobSnapshot | 'salary' | 'experience'
  label: string
  kind: DiffKind
  read: (snapshot: JobSnapshot) => string | string[]
}

const FIELDS: FieldSpec[] = [
  { key: 'title', label: 'Title', kind: 'scalar', read: (s) => s.title },
  { key: 'department', label: 'Department', kind: 'scalar', read: (s) => s.department },
  { key: 'location', label: 'Location', kind: 'scalar', read: (s) => s.location },
  { key: 'work_mode', label: 'Work mode', kind: 'scalar', read: (s) => workModeLabel(s.work_mode) },
  {
    key: 'employment_type',
    label: 'Employment type',
    kind: 'scalar',
    read: (s) => employmentTypeLabel(s.employment_type),
  },
  {
    key: 'experience',
    label: 'Experience',
    kind: 'scalar',
    read: (s) => `${s.experience_min_years}–${s.experience_max_years} years`,
  },
  {
    key: 'salary',
    label: 'Salary',
    kind: 'scalar',
    read: (s) =>
      formatSalaryRange(s.salary_min, s.salary_max, s.salary_currency, { compact: false }) ||
      'Not specified',
  },
  { key: 'openings', label: 'Openings', kind: 'scalar', read: (s) => String(s.openings) },
  { key: 'domain', label: 'Domain', kind: 'scalar', read: (s) => s.domain ?? '' },
  {
    key: 'required_skills',
    label: 'Required skills',
    kind: 'list',
    read: (s) => s.required_skills.map(skillLabel),
  },
  {
    key: 'preferred_skills',
    label: 'Preferred skills',
    kind: 'list',
    read: (s) => s.preferred_skills.map(skillLabel),
  },
  {
    key: 'education_requirements',
    label: 'Education',
    kind: 'text',
    read: (s) => s.education_requirements,
  },
  {
    key: 'responsibilities',
    label: 'Responsibilities',
    kind: 'lines',
    read: (s) => splitLines(s.responsibilities),
  },
  {
    key: 'qualifications',
    label: 'Qualifications',
    kind: 'lines',
    read: (s) => splitLines(s.qualifications),
  },
  {
    key: 'additional_requirements',
    label: 'Additional requirements',
    kind: 'text',
    read: (s) => s.additional_requirements,
  },
  { key: 'description', label: 'Description', kind: 'text', read: (s) => s.description },
]

function same(a: string | string[], b: string | string[]): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => item === b[index])
  }
  return a === b
}

/** Field-level differences between two snapshots (plan.md 9.6 Compare), in display order. */
export function diffSnapshots(before: JobSnapshot, after: JobSnapshot): FieldDiff[] {
  const diffs: FieldDiff[] = []
  for (const field of FIELDS) {
    const previous = field.read(before)
    const next = field.read(after)
    if (!same(previous, next)) {
      diffs.push({
        key: field.key,
        label: field.label,
        kind: field.kind,
        before: previous,
        after: next,
      })
    }
  }
  return diffs
}

export type ItemState = 'same' | 'added' | 'removed'

/** Marks each item of a list as unchanged, added (only in `after`) or removed (only in `before`). */
export function markItems(
  items: readonly string[],
  other: readonly string[],
  side: 'before' | 'after',
): { text: string; state: ItemState }[] {
  const otherSet = new Set(other)
  return items.map((text) => ({
    text,
    state: otherSet.has(text) ? 'same' : side === 'after' ? 'added' : 'removed',
  }))
}
