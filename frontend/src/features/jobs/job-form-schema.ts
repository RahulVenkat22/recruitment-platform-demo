import { z } from 'zod'
import type { PeoplePickerValue } from '@/components/shared/PeoplePicker'
import type {
  JobCreateRequest,
  JobDetail,
  JobSnapshot,
  JobUpdateRequest,
  ParticipantRole,
  SessionUser,
} from '@/types/domain'

export const WORK_MODES = ['onsite', 'hybrid', 'remote'] as const
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'internship'] as const
export const PARTICIPANT_ROLES = [
  'owner',
  'recruiter',
  'hiring_manager',
  'interviewer',
  'observer',
] as const
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'] as const
export const DOMAIN_SUGGESTIONS = [
  'fintech',
  'banking',
  'ecommerce',
  'retail',
  'healthcare',
  'pharma',
  'saas',
  'enterprise software',
  'edtech',
  'logistics',
  'media',
  'gaming',
] as const

export const EXPERIENCE_MAX = 50
export const OPENINGS_MAX = 500

/**
 * Number inputs are kept as strings in the form so an empty box is "unset"
 * rather than 0; `superRefine` parses and cross-checks them (plan.md 9.5).
 */
export const jobFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Enter a job title.')
      .max(200, 'Keep the title under 200 characters.'),
    department: z.string().trim().min(1, 'Enter a department.').max(120, 'Too long.'),
    location: z.string().trim().min(1, 'Enter a location.').max(160, 'Too long.'),
    work_mode: z.enum(WORK_MODES),
    employment_type: z.enum(EMPLOYMENT_TYPES),
    experience_min_years: z.string(),
    experience_max_years: z.string(),
    openings: z.string(),
    domain: z.string().trim().max(120, 'Too long.'),
    salary_min: z.string(),
    salary_max: z.string(),
    salary_currency: z.string().trim().toUpperCase().length(3, 'Use a 3-letter currency code.'),
    required_skills: z.array(z.string()).min(1, 'Add at least one required skill.'),
    preferred_skills: z.array(z.string()),
    education_requirements: z.string(),
    responsibilities: z.string(),
    qualifications: z.string(),
    additional_requirements: z.string(),
    description: z.string(),
    participants: z.array(
      z.object({ user_id: z.string(), role_in_recruitment: z.enum(PARTICIPANT_ROLES) }),
    ),
  })
  .superRefine((values, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message })

    const expMin = parseWhole(values.experience_min_years)
    const expMax = parseWhole(values.experience_max_years)
    if (expMin === null) issue('experience_min_years', 'Enter the minimum experience.')
    else if (expMin === undefined || expMin > EXPERIENCE_MAX)
      issue('experience_min_years', `Enter a whole number from 0 to ${EXPERIENCE_MAX}.`)
    if (expMax === null) issue('experience_max_years', 'Enter the maximum experience.')
    else if (expMax === undefined || expMax > EXPERIENCE_MAX)
      issue('experience_max_years', `Enter a whole number from 0 to ${EXPERIENCE_MAX}.`)
    if (typeof expMin === 'number' && typeof expMax === 'number' && expMin > expMax)
      issue('experience_max_years', 'Maximum experience must be at least the minimum.')

    const openings = parseWhole(values.openings)
    if (openings === null || openings === undefined || openings < 1 || openings > OPENINGS_MAX)
      issue('openings', `Enter a whole number from 1 to ${OPENINGS_MAX}.`)

    const salaryMin = parseWhole(values.salary_min)
    const salaryMax = parseWhole(values.salary_max)
    if (salaryMin === undefined) issue('salary_min', 'Enter a whole annual amount.')
    if (salaryMax === undefined) issue('salary_max', 'Enter a whole annual amount.')
    if (typeof salaryMin === 'number' && typeof salaryMax === 'number' && salaryMin > salaryMax)
      issue('salary_max', 'Maximum salary must be at least the minimum.')
  })

export type JobFormValues = z.infer<typeof jobFormSchema>

/** `null` for empty, `undefined` for not a whole number, else the number. */
export function parseWhole(raw: string): number | null | undefined {
  const text = raw.replace(/[,\s]/g, '')
  if (text === '') return null
  if (!/^\d+$/.test(text)) return undefined
  return Number(text)
}

export const FORM_SECTIONS = [
  { id: 'basics', label: 'Basics' },
  { id: 'compensation', label: 'Compensation' },
  { id: 'skills', label: 'Skills' },
  { id: 'details', label: 'Details' },
  { id: 'people', label: 'People Involved' },
] as const

export type FormSectionId = (typeof FORM_SECTIONS)[number]['id']

/** Which sections are complete and the overall completion for the rail meter (plan.md 9.5). */
export function completionOf(values: JobFormValues, creatorId: string | undefined) {
  const filled = (text: string) => text.trim().length > 0
  const checks: Record<FormSectionId, boolean[]> = {
    basics: [
      filled(values.title),
      filled(values.department),
      filled(values.location),
      filled(values.experience_min_years),
      filled(values.experience_max_years),
    ],
    compensation: [filled(values.salary_min), filled(values.salary_max)],
    skills: [values.required_skills.length > 0, values.preferred_skills.length > 0],
    details: [
      filled(values.description),
      filled(values.responsibilities),
      filled(values.qualifications),
    ],
    people: [values.participants.some((entry) => entry.user_id !== creatorId)],
  }
  const sections = Object.fromEntries(
    Object.entries(checks).map(([id, flags]) => [id, flags.every(Boolean)]),
  ) as Record<FormSectionId, boolean>
  const all = Object.values(checks).flat()
  const percent = Math.round((all.filter(Boolean).length / all.length) * 100)
  return { sections, percent }
}

export function emptyJobForm(user: SessionUser | null): JobFormValues {
  return {
    title: '',
    department: '',
    location: '',
    work_mode: 'hybrid',
    employment_type: 'full_time',
    experience_min_years: '',
    experience_max_years: '',
    openings: '1',
    domain: '',
    salary_min: '',
    salary_max: '',
    salary_currency: 'INR',
    required_skills: [],
    preferred_skills: [],
    education_requirements: '',
    responsibilities: '',
    qualifications: '',
    additional_requirements: '',
    description: '',
    participants: user ? [{ user_id: user.id, role_in_recruitment: 'owner' }] : [],
  }
}

export function jobToForm(job: JobDetail): JobFormValues {
  return {
    title: job.title,
    department: job.department,
    location: job.location,
    work_mode: job.work_mode,
    employment_type: job.employment_type,
    experience_min_years: String(job.experience_min_years),
    experience_max_years: String(job.experience_max_years),
    openings: String(job.openings),
    domain: job.domain ?? '',
    salary_min: job.salary_min === null ? '' : String(job.salary_min),
    salary_max: job.salary_max === null ? '' : String(job.salary_max),
    salary_currency: job.salary_currency,
    required_skills: job.required_skill_names.length
      ? [...job.required_skill_names]
      : [...job.required_skills],
    preferred_skills: job.preferred_skill_names.length
      ? [...job.preferred_skill_names]
      : [...job.preferred_skills],
    education_requirements: job.education_requirements,
    responsibilities: job.responsibilities,
    qualifications: job.qualifications,
    additional_requirements: job.additional_requirements,
    description: job.description,
    participants: job.participants.map((participant) => ({
      user_id: participant.user.id,
      role_in_recruitment: participant.role_in_recruitment,
    })),
  }
}

function contentPayload(values: JobFormValues) {
  const whole = (raw: string) => parseWhole(raw) ?? 0
  const optional = (raw: string) => {
    const parsed = parseWhole(raw)
    return typeof parsed === 'number' ? parsed : null
  }
  return {
    title: values.title.trim(),
    department: values.department.trim(),
    location: values.location.trim(),
    work_mode: values.work_mode,
    employment_type: values.employment_type,
    experience_min_years: whole(values.experience_min_years),
    experience_max_years: whole(values.experience_max_years),
    openings: whole(values.openings) || 1,
    domain: values.domain.trim() || null,
    salary_min: optional(values.salary_min),
    salary_max: optional(values.salary_max),
    salary_currency: values.salary_currency.trim().toUpperCase(),
    required_skills: values.required_skills,
    preferred_skills: values.preferred_skills,
    education_requirements: values.education_requirements,
    responsibilities: values.responsibilities,
    qualifications: values.qualifications,
    additional_requirements: values.additional_requirements,
    description: values.description,
    participants: values.participants.map((entry) => ({
      user_id: entry.user_id,
      role_in_recruitment: entry.role_in_recruitment as ParticipantRole,
    })),
  }
}

export function formToCreatePayload(
  values: JobFormValues,
  status: 'draft' | 'open',
): JobCreateRequest {
  return { ...contentPayload(values), status }
}

export function formToUpdatePayload(
  values: JobFormValues,
  changeSummary: string,
): JobUpdateRequest {
  return { ...contentPayload(values), change_summary: changeSummary.trim() }
}

/** The form's values in the shape the overview renders (numbers parsed, blanks nulled). */
export function formToSnapshot(values: JobFormValues): JobSnapshot {
  const whole = (raw: string) => parseWhole(raw) ?? 0
  const optional = (raw: string) => {
    const parsed = parseWhole(raw)
    return typeof parsed === 'number' ? parsed : null
  }
  return {
    title: values.title,
    department: values.department,
    location: values.location,
    work_mode: values.work_mode,
    employment_type: values.employment_type,
    experience_min_years: whole(values.experience_min_years),
    experience_max_years: whole(values.experience_max_years),
    salary_min: optional(values.salary_min),
    salary_max: optional(values.salary_max),
    salary_currency: (values.salary_currency || 'INR').toUpperCase(),
    required_skills: values.required_skills,
    preferred_skills: values.preferred_skills,
    education_requirements: values.education_requirements,
    responsibilities: values.responsibilities,
    qualifications: values.qualifications,
    additional_requirements: values.additional_requirements,
    description: values.description,
    domain: values.domain || null,
    openings: whole(values.openings) || 1,
  }
}

export function participantsOf(values: JobFormValues): PeoplePickerValue[] {
  return values.participants.map((entry) => ({
    user_id: entry.user_id,
    role_in_recruitment: entry.role_in_recruitment as ParticipantRole,
  }))
}

/** Fields the API may return errors for, mapped onto the form (server errors -> setError). */
export const SERVER_FIELDS: (keyof JobFormValues)[] = [
  'title',
  'department',
  'location',
  'work_mode',
  'employment_type',
  'experience_min_years',
  'experience_max_years',
  'openings',
  'domain',
  'salary_min',
  'salary_max',
  'salary_currency',
  'required_skills',
  'preferred_skills',
  'education_requirements',
  'responsibilities',
  'qualifications',
  'additional_requirements',
  'description',
  'participants',
]
