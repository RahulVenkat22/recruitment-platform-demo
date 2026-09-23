import { z } from 'zod'
import type { PeoplePickerValue } from '@/components/shared/PeoplePicker'
import type {
  JobCreateRequest,
  JobDetail,
  JobExtractedFields,
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

/** The select's codes, plus the current value when an uploaded file brought in another one. */
export function currencyOptions(current: string): readonly string[] {
  const known: readonly string[] = CURRENCIES
  return current && !known.includes(current) ? [...known, current] : known
}

export const EXPERIENCE_MAX = 50
export const OPENINGS_MAX = 500
/** The largest annual amount the API stores (a PostgreSQL integer). */
export const SALARY_MAX = 2_000_000_000

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
    country: z.string().trim(),
    city: z.string().trim().max(160, 'Too long.'),
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

    // A place is required; it is picked inside a country, so a missing country is the first ask.
    if (!values.city) {
      if (values.country) issue('city', `Choose a location in ${values.country}.`)
      else issue('country', 'Choose a country, then a location.')
    }

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
    const tooLarge = `Enter a whole annual amount up to ${SALARY_MAX.toLocaleString('en-IN')}.`
    if (salaryMin === undefined) issue('salary_min', 'Enter a whole annual amount.')
    else if (salaryMin !== null && salaryMin > SALARY_MAX) issue('salary_min', tooLarge)
    if (salaryMax === undefined) issue('salary_max', 'Enter a whole annual amount.')
    else if (salaryMax !== null && salaryMax > SALARY_MAX) issue('salary_max', tooLarge)
    // A range needs both ends: the team sees "from - to", never a lone figure.
    if (salaryMin === null && typeof salaryMax === 'number')
      issue('salary_min', 'Enter the salary from as well, or leave both empty.')
    if (salaryMax === null && typeof salaryMin === 'number')
      issue('salary_max', 'Enter the salary to as well, or leave both empty.')
    if (typeof salaryMin === 'number' && typeof salaryMax === 'number' && salaryMin > salaryMax)
      issue('salary_max', 'Salary to must be at least the salary from.')
  })

export type JobFormValues = z.infer<typeof jobFormSchema>

/** A stored location label, "<city>, <country>", as the form's two boxes; no comma means all city. */
export function splitLocation(label: string): Pick<JobFormValues, 'country' | 'city'> {
  const at = label.lastIndexOf(',')
  if (at === -1) return { country: '', city: label.trim() }
  return { country: label.slice(at + 1).trim(), city: label.slice(0, at).trim() }
}

export function joinLocation(city: string, country: string): string {
  return country ? `${city}, ${country}` : city
}

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
      filled(values.city),
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
    country: '',
    city: '',
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
    ...splitLocation(job.location),
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

/** The fields the AI read from an uploaded file as form values: numbers become the form's strings. */
export function extractionToForm(fields: JobExtractedFields): Partial<JobFormValues> {
  const text = (value: number | undefined) => (value === undefined ? undefined : String(value))
  const values: Partial<JobFormValues> = {
    title: fields.title,
    department: fields.department,
    ...(fields.location === undefined ? {} : splitLocation(fields.location)),
    work_mode: fields.work_mode,
    employment_type: fields.employment_type,
    experience_min_years: text(fields.experience_min_years),
    experience_max_years: text(fields.experience_max_years),
    openings: text(fields.openings),
    domain: fields.domain,
    salary_min: text(fields.salary_min),
    salary_max: text(fields.salary_max),
    salary_currency: fields.salary_currency,
    required_skills: fields.required_skills,
    preferred_skills: fields.preferred_skills,
    education_requirements: fields.education_requirements,
    responsibilities: fields.responsibilities,
    qualifications: fields.qualifications,
    additional_requirements: fields.additional_requirements,
    description: fields.description,
  }
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<JobFormValues>
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
    location: joinLocation(values.city.trim(), values.country.trim()),
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
    location: joinLocation(values.city, values.country),
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
