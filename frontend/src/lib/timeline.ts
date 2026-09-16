import { humanise } from '@/lib/enums'
import { formatDate, formatDateTime, formatDayHeading } from '@/lib/format'
import type { Activity } from '@/types/domain'

export interface TimelineDay {
  key: string
  label: string
  items: Activity[]
}

/** Groups newest-first activities by calendar day, keeping the order. */
export function groupByDay(items: readonly Activity[]): TimelineDay[] {
  const days: TimelineDay[] = []
  for (const item of items) {
    const key = item.occurred_at.slice(0, 10)
    const last = days[days.length - 1]
    if (last && last.key === key) last.items.push(item)
    else days.push({ key, label: formatDayHeading(item.occurred_at), items: [item] })
  }
  return days
}

/** Loose reads over `metadata`, which is a free-form JSON object per event type. */
export type Metadata = Record<string, unknown>

export function metaString(meta: Metadata, key: string): string | null {
  const value = meta[key]
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number') return String(value)
  return null
}

export function metaNumber(meta: Metadata, key: string): number | null {
  const value = meta[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)))
    return Number(value)
  return null
}

export function metaStrings(meta: Metadata, key: string): string[] {
  const value = meta[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

export interface MetaPerson {
  id?: string
  name: string
  avatar_url?: string | null
  role?: string
}

export function metaPeople(meta: Metadata, key: string): MetaPerson[] {
  const value = meta[key]
  if (!Array.isArray(value)) return []
  return value
    .map((entry): MetaPerson | null => {
      if (!entry || typeof entry !== 'object') return null
      const record = entry as Record<string, unknown>
      const name = typeof record.name === 'string' ? record.name : null
      if (!name) return null
      return {
        id:
          typeof record.user_id === 'string'
            ? record.user_id
            : typeof record.id === 'string'
              ? record.id
              : undefined,
        name,
        avatar_url: typeof record.avatar_url === 'string' ? record.avatar_url : null,
        role: typeof record.role === 'string' ? record.role : undefined,
      }
    })
    .filter((entry): entry is MetaPerson => entry !== null)
}

export function metaPerson(meta: Metadata, key: string): MetaPerson | null {
  const value = meta[key]
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.name !== 'string') return null
  return {
    id:
      typeof record.id === 'string'
        ? record.id
        : typeof record.user_id === 'string'
          ? record.user_id
          : undefined,
    name: record.name,
    avatar_url: typeof record.avatar_url === 'string' ? record.avatar_url : null,
  }
}

// ------------------------------------------------------------ readability
// Enhancement.md 5: the timeline is for end users. Field names come from the
// API as snake_case and values as enum keys; everything below turns them into
// words, hides database identifiers, and shapes "what changed" as From → To.

/** Field names whose plain humanised form reads badly. */
const FIELD_LABELS: Record<string, string> = {
  experience_min_years: 'Minimum experience (years)',
  experience_max_years: 'Maximum experience (years)',
  salary_min: 'Salary from',
  salary_max: 'Salary to',
  salary_currency: 'Salary currency',
  required_skills: 'Required skills',
  preferred_skills: 'Preferred skills',
  education_requirements: 'Educational requirements',
  additional_requirements: 'Additional requirements',
  description: 'Full job description',
  work_mode: 'Work mode',
  employment_type: 'Employment type',
  job_description: 'Job description',
  interview_date: 'Interview date',
  scheduled_at: 'Scheduled for',
  next_action_at: 'Follow-up due',
  next_action: 'Next step',
  meeting_link: 'Meeting link',
  annual_ctc: 'Annual CTC',
  joining_date: 'Joining date',
  start_date: 'Start date',
  match_pct: 'AI match',
  total_found: 'Candidates found',
  new_candidates: 'New candidates',
  existing_candidates: 'Already known',
  shortlisted: 'AI shortlisted',
  checklist_done: 'Checklist items done',
  checklist_total: 'Checklist items',
  change_summary: 'Change summary',
  role: 'Role in recruitment',
  status: 'Status',
  interviewer: 'Interviewer',
  outcome: 'Outcome',
  channel: 'Channel',
  direction: 'Direction',
  recommendation: 'Recommendation',
  score: 'Score',
  designation: 'Designation',
  buddy: 'Buddy',
  hr_contact: 'HR contact',
  summary: 'Summary',
  comment: 'Comment',
  reason: 'Reason',
  note: 'Note',
  round: 'Round',
  mode: 'Mode',
  sources: 'Sources',
  version: 'Version',
  openings: 'Openings',
  domain: 'Domain',
  title: 'Title',
  department: 'Department',
  location: 'Location',
  qualifications: 'Qualifications',
  responsibilities: 'Responsibilities',
}

/** "experience_max_years" -> "Maximum experience (years)"; unknown keys read as words. */
export function humaniseField(key: string): string {
  const known = FIELD_LABELS[key]
  if (known) return known
  const text = key.replace(/[_-]+/g, ' ').trim()
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Keys that are database identifiers or bookkeeping and never mean anything to a person. */
const TECHNICAL_KEY = /(^|_)(id|ids|uuid|pk)$|^(kind|forced|application_ids|candidate_ids)$/

export function isTechnicalKey(key: string): boolean {
  return TECHNICAL_KEY.test(key)
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const ENUM_KEY = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$|^[a-z]+$/

/**
 * A metadata value as a person would read it: enum keys become words
 * ("hr_review" -> "HR Review" through the enum catalogue's `humanise`), ISO
 * dates get the app's date format, lists are joined, empty values read "—".
 */
export function humaniseValue(value: unknown, field?: string): string {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => humaniseValue(item, field)).join(', ') : '—'
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    if (typeof record.name === 'string') return record.name
    return Object.values(record)
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .join(', ')
  }
  const text = String(value)
  if (ISO_DATETIME.test(text)) return formatDateTime(text)
  if (ISO_DATE.test(text) && (field?.endsWith('_date') || field?.endsWith('_at'))) {
    return formatDate(text)
  }
  if (field === 'required_skills' || field === 'preferred_skills') return humanise(text)
  // A skill key, status key or role key: words. Free text (spaces, capitals) stays as typed.
  if (ENUM_KEY.test(text) && text.length <= 40) return humanise(text)
  return text
}

export interface FieldChange {
  field: string
  label: string
  from: string
  to: string
  /** The stored values, so status keys can render as badges. */
  fromRaw: unknown
  toRaw: unknown
}

/**
 * Every "from -> to" an event carries (Enhancement.md 5): a top-level
 * `from` / `to` pair (status moves, role changes) and a `changes` map of
 * `{field: {from, to}}` (job description edits). Only real changes are kept.
 */
export function changesOf(meta: Metadata, eventType: string): FieldChange[] {
  const result: FieldChange[] = []
  if ('from' in meta || 'to' in meta) {
    const from = humaniseValue(meta.from)
    const to = humaniseValue(meta.to)
    if (from !== to) {
      result.push({
        field: 'status',
        label: changeLabelFor(eventType),
        from,
        to,
        fromRaw: meta.from,
        toRaw: meta.to,
      })
    }
  }
  const changes = meta.changes
  if (changes && typeof changes === 'object' && !Array.isArray(changes)) {
    for (const [field, value] of Object.entries(changes as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue
      const pair = value as Record<string, unknown>
      const from = humaniseValue(pair.from, field)
      const to = humaniseValue(pair.to, field)
      if (from !== to) {
        result.push({
          field,
          label: humaniseField(field),
          from,
          to,
          fromRaw: pair.from,
          toRaw: pair.to,
        })
      }
    }
  }
  return result
}

/** What a bare from/to on this event describes. */
function changeLabelFor(eventType: string): string {
  if (eventType === 'jd.participant_updated') return 'Role in recruitment'
  if (eventType.startsWith('offer.')) return 'Offer status'
  if (eventType.startsWith('onboarding.')) return 'Onboarding status'
  return 'Status'
}

/** The reason or note the actor gave, whichever the event stored (never both). */
export function reasonOf(meta: Metadata): { label: string; text: string } | null {
  for (const key of ['reason', 'note', 'comment', 'change_summary', 'summary'] as const) {
    const text = metaString(meta, key)
    if (text) return { label: humaniseField(key), text }
  }
  return null
}

/** Free-text match over the title, description and actor name. */
export function matchesText(item: Activity, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const haystack = [
    item.title,
    item.description,
    item.actor?.full_name ?? '',
    item.candidate?.full_name ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}
