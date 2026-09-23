import { useEffect } from 'react'
import { create } from 'zustand'
import { api, endpoints } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import type {
  ActivityCategory,
  ApplicationStatus,
  CandidateSource,
  EnumCatalogue,
  JDStatus,
  KeyLabel,
  TicketPriority,
  TicketStatus,
} from '@/types/domain'

/** What a badge needs: display label, soft background, text colour. */
export interface EnumMeta {
  label: string
  bg: string
  fg: string
}

export type EnumMetaKind =
  'status' | 'source' | 'category' | 'jd_status' | 'ticket_status' | 'ticket_priority'

// --------------------------------------------------------------------- fallbacks
// plan.md 8.1 colours, kept in step with backend/common/enums.py. The live
// catalogue from GET /meta/enums/ wins whenever it is loaded; this table covers
// tests, the first paint, and an API that is briefly unreachable.

export const FALLBACK_STATUS: Record<ApplicationStatus, EnumMeta> = {
  new: { label: 'New', bg: '#EEF1F5', fg: '#3B4452' },
  ai_shortlisted: { label: 'AI Shortlisted', bg: '#E8EAFB', fg: '#3F3FB5' },
  hr_review: { label: 'HR Review', bg: '#F0E8FB', fg: '#6B34A8' },
  contact_pending: { label: 'Contact Pending', bg: '#FBF1DC', fg: '#8A5A0B' },
  contacted: { label: 'Contacted', bg: '#E0F0FB', fg: '#0B5C94' },
  phone_screening: { label: 'Phone Screening', bg: '#DDF4F6', fg: '#0B6B72' },
  interview_scheduled: { label: 'Interview Scheduled', bg: '#E4ECFB', fg: '#1D4ED8' },
  technical_interview: { label: 'Technical Interview', bg: '#DCE6FA', fg: '#1E40AF' },
  hr_interview: { label: 'HR Interview', bg: '#E4ECFB', fg: '#2B4FCF' },
  final_interview: { label: 'Final Interview', bg: '#E3E6F9', fg: '#312E81' },
  selected: { label: 'Selected', bg: '#E3F3EA', fg: '#1F7A4D' },
  offer_sent: { label: 'Offer Sent', bg: '#FBF1DC', fg: '#8F5D12' },
  offer_accepted: { label: 'Offer Accepted', bg: '#DCF5E3', fg: '#166534' },
  onboarding: { label: 'Onboarding', bg: '#DDF3EF', fg: '#0F766E' },
  onboarded: { label: 'Onboarded', bg: '#D1F0DA', fg: '#166534' },
  rejected: { label: 'Rejected', bg: '#FCE8E6', fg: '#B42318' },
  withdrawn: { label: 'Withdrawn', bg: '#ECEEF2', fg: '#5C6371' },
  on_hold: { label: 'On Hold', bg: '#F6E7D8', fg: '#9A4D12' },
}

export const FALLBACK_SOURCE: Record<CandidateSource, EnumMeta> = {
  internal: { label: 'Internal Database', bg: '#ECEEF2', fg: '#0E1013' },
  referral: { label: 'Referral', bg: '#E3F3EA', fg: '#1F7A4D' },
  naukri: { label: 'Naukri', bg: '#EAF0FF', fg: '#2F54EB' },
  linkedin: { label: 'LinkedIn', bg: '#E1EEF8', fg: '#0A66C2' },
}

export const FALLBACK_CATEGORY: Record<ActivityCategory, EnumMeta> = {
  job_description: { label: 'Job Description', bg: '#EEF1F5', fg: '#3B4452' },
  candidate_search: { label: 'Candidate Search', bg: '#E8EAFB', fg: '#3F3FB5' },
  candidate_shortlisted: { label: 'Candidate Shortlisted', bg: '#F0E8FB', fg: '#6B34A8' },
  candidate_contact: { label: 'Candidate Contact', bg: '#E0F0FB', fg: '#0B5C94' },
  interview: { label: 'Interview', bg: '#E4ECFB', fg: '#1D4ED8' },
  interview_feedback: { label: 'Interview Feedback', bg: '#DDF4F6', fg: '#0B6B72' },
  candidate_selected: { label: 'Candidate Selected', bg: '#E3F3EA', fg: '#1F7A4D' },
  offer: { label: 'Offer', bg: '#FBF1DC', fg: '#8F5D12' },
  onboarding: { label: 'Onboarding', bg: '#DDF3EF', fg: '#0F766E' },
  decision: { label: 'Rejected / On Hold', bg: '#FCE8E6', fg: '#B42318' },
}

/** The API serves JD status labels but no colours yet; these reuse the status palette. */
export const FALLBACK_JD_STATUS: Record<JDStatus, EnumMeta> = {
  draft: { label: 'Draft', bg: '#EEF1F5', fg: '#3B4452' },
  open: { label: 'Open', bg: '#E3F3EA', fg: '#1F7A4D' },
  on_hold: { label: 'On Hold', bg: '#F6E7D8', fg: '#9A4D12' },
  closed: { label: 'Closed', bg: '#ECEEF2', fg: '#5C6371' },
  force_closed: { label: 'Force Closed', bg: '#FCE8E6', fg: '#B42318' },
  archived: { label: 'Archived', bg: '#ECEEF2', fg: '#5C6371' },
}

/** Support ticket badges; colours mirror backend/common/enums.py TICKET_*_COLORS. */
export const FALLBACK_TICKET_STATUS: Record<TicketStatus, EnumMeta> = {
  open: { label: 'Open', bg: '#E4ECFB', fg: '#1D4ED8' },
  in_progress: { label: 'In Progress', bg: '#FBF1DC', fg: '#8F5D12' },
  resolved: { label: 'Resolved', bg: '#E3F3EA', fg: '#1F7A4D' },
  closed: { label: 'Closed', bg: '#ECEEF2', fg: '#5C6371' },
}

export const FALLBACK_TICKET_PRIORITY: Record<TicketPriority, EnumMeta> = {
  low: { label: 'Low', bg: '#EEF1F5', fg: '#3B4452' },
  medium: { label: 'Medium', bg: '#E0F0FB', fg: '#0B5C94' },
  high: { label: 'High', bg: '#FBF1DC', fg: '#8F5D12' },
  urgent: { label: 'Urgent', bg: '#FCE8E6', fg: '#B42318' },
}

/** Label-only fallbacks for enums that have no colour, used by selects and read-only tables. */
const FALLBACK_OPTIONS: Record<string, KeyLabel[]> = {
  application_status: Object.entries(FALLBACK_STATUS).map(([key, m]) => ({ key, label: m.label })),
  candidate_source: Object.entries(FALLBACK_SOURCE).map(([key, m]) => ({ key, label: m.label })),
  activity_category: Object.entries(FALLBACK_CATEGORY).map(([key, m]) => ({
    key,
    label: m.label,
  })),
  jd_status: Object.entries(FALLBACK_JD_STATUS).map(([key, m]) => ({ key, label: m.label })),
  ticket_status: Object.entries(FALLBACK_TICKET_STATUS).map(([key, m]) => ({
    key,
    label: m.label,
  })),
  ticket_priority: Object.entries(FALLBACK_TICKET_PRIORITY).map(([key, m]) => ({
    key,
    label: m.label,
  })),
  ticket_category: [
    { key: 'access', label: 'Access & permissions' },
    { key: 'job_description', label: 'Job description' },
    { key: 'candidate_data', label: 'Candidate data' },
    { key: 'interviews', label: 'Interviews & scheduling' },
    { key: 'offers', label: 'Offers & onboarding' },
    { key: 'technical', label: 'Technical issue' },
    { key: 'feature_request', label: 'Feature request' },
    { key: 'other', label: 'Other' },
  ],
  user_role: [
    { key: 'hr_admin', label: 'HR Admin' },
    { key: 'hr', label: 'HR' },
    { key: 'interviewer', label: 'Interviewer' },
    { key: 'employee', label: 'Employee' },
  ],
  participant_role: [
    { key: 'owner', label: 'Owner' },
    { key: 'recruiter', label: 'Recruiter' },
    { key: 'hiring_manager', label: 'Hiring Manager' },
    { key: 'interviewer', label: 'Interviewer' },
    { key: 'observer', label: 'Observer' },
  ],
}

/** Every timeline category in plan.md 6.4 order; the filter chips start with all of them selected. */
export const ACTIVITY_CATEGORIES = Object.keys(FALLBACK_CATEGORY) as ActivityCategory[]

const NEUTRAL: Omit<EnumMeta, 'label'> = { bg: '#EEF1F5', fg: '#3B4452' }

/** "some_future_status" -> "Some Future Status". */
export function humanise(key: string): string {
  return key
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

// ------------------------------------------------------------------------ store

export type EnumsLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface EnumsState {
  catalogue: EnumCatalogue | null
  status: EnumsLoadStatus
  setCatalogue: (catalogue: EnumCatalogue) => void
  setStatus: (status: EnumsLoadStatus) => void
  reset: () => void
}

export const useEnumsStore = create<EnumsState>()((set) => ({
  catalogue: null,
  status: 'idle',
  setCatalogue: (catalogue) => set({ catalogue, status: 'ready' }),
  setStatus: (status) => set({ status }),
  reset: () => set({ catalogue: null, status: 'idle' }),
}))

let inFlight: Promise<EnumCatalogue> | null = null

/** Fetches `GET /meta/enums/` once; concurrent callers share the request, later callers get the cache. */
export function loadEnums(): Promise<EnumCatalogue> {
  const { catalogue } = useEnumsStore.getState()
  if (catalogue) return Promise.resolve(catalogue)
  if (!inFlight) {
    useEnumsStore.getState().setStatus('loading')
    inFlight = api
      .get<EnumCatalogue>(endpoints.metaEnums)
      .then(({ data }) => {
        useEnumsStore.getState().setCatalogue(data)
        return data
      })
      .catch((error: unknown) => {
        useEnumsStore.getState().setStatus('error')
        throw error
      })
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

/** Loads the catalogue as soon as there is an authenticated session; the endpoint needs a token. */
export function useLoadEnums(): EnumsLoadStatus {
  const authed = useAuthStore((state) => state.status === 'authed')
  const status = useEnumsStore((state) => state.status)

  useEffect(() => {
    if (!authed) return
    if (useEnumsStore.getState().catalogue) return
    loadEnums().catch(() => {
      // The fallback table keeps badges rendering; nothing to surface here.
    })
  }, [authed])

  return status
}

// ---------------------------------------------------------------------- lookups

const KIND_TO_ENUM: Record<EnumMetaKind, string> = {
  status: 'application_status',
  source: 'candidate_source',
  category: 'activity_category',
  jd_status: 'jd_status',
  ticket_status: 'ticket_status',
  ticket_priority: 'ticket_priority',
}

const KIND_TO_FALLBACK: Record<EnumMetaKind, Record<string, EnumMeta>> = {
  status: FALLBACK_STATUS,
  source: FALLBACK_SOURCE,
  category: FALLBACK_CATEGORY,
  jd_status: FALLBACK_JD_STATUS,
  ticket_status: FALLBACK_TICKET_STATUS,
  ticket_priority: FALLBACK_TICKET_PRIORITY,
}

function resolveMeta(catalogue: EnumCatalogue | null, kind: EnumMetaKind, key: string): EnumMeta {
  const enumName = KIND_TO_ENUM[kind]
  const fallback: EnumMeta | undefined = KIND_TO_FALLBACK[kind][key]
  const apiLabel = catalogue?.enums[enumName]?.find((option) => option.key === key)?.label
  const apiColor = catalogue?.colors[enumName]?.[key]
  return {
    label: apiLabel ?? fallback?.label ?? humanise(key),
    bg: apiColor?.bg ?? fallback?.bg ?? NEUTRAL.bg,
    fg: apiColor?.text ?? fallback?.fg ?? NEUTRAL.fg,
  }
}

export function enumMeta(kind: EnumMetaKind, key: string): EnumMeta {
  return resolveMeta(useEnumsStore.getState().catalogue, kind, key)
}

export const statusMeta = (key: string): EnumMeta => enumMeta('status', key)
export const sourceMeta = (key: string): EnumMeta => enumMeta('source', key)
export const categoryMeta = (key: string): EnumMeta => enumMeta('category', key)
export const jdStatusMeta = (key: string): EnumMeta => enumMeta('jd_status', key)

/** Subscribing variant for components, so badges re-render when the catalogue lands. */
export function useEnumMeta(kind: EnumMetaKind, key: string): EnumMeta {
  const catalogue = useEnumsStore((state) => state.catalogue)
  return resolveMeta(catalogue, kind, key)
}

/** `{key, label}` options for any enum name in the catalogue, e.g. "user_role". */
export function enumOptions(name: string): KeyLabel[] {
  return useEnumsStore.getState().catalogue?.enums[name] ?? FALLBACK_OPTIONS[name] ?? []
}

export function useEnumOptions(name: string): KeyLabel[] {
  const catalogue = useEnumsStore((state) => state.catalogue)
  return catalogue?.enums[name] ?? FALLBACK_OPTIONS[name] ?? []
}

export function enumLabel(name: string, key: string): string {
  return enumOptions(name).find((option) => option.key === key)?.label ?? humanise(key)
}
