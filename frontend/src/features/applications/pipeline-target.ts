import type { ApplicationRef, ApplicationRow } from '@/types/domain'

/**
 * The little an action dialog needs to know about an application: enough to
 * name the candidate, scope queries to the JD and decide which moves apply.
 * Both a ranked row and the `application` nested in an interview or offer fit.
 */
export interface PipelineTarget {
  id: string
  job_description: string
  status: string
  candidate: {
    id: string
    full_name: string
    avatar_url?: string | null
    /** Present when the source row carried it; `undefined` means unknown, not missing. */
    email?: string | null
  }
  job?: { title: string } | null
}

export function toTarget(source: ApplicationRow | ApplicationRef): PipelineTarget {
  return {
    id: source.id,
    job_description: source.job_description,
    status: source.status,
    candidate: {
      id: source.candidate.id,
      full_name: source.candidate.full_name,
      avatar_url: source.candidate.avatar_url,
      email: 'email' in source.candidate ? source.candidate.email : undefined,
    },
    job: source.job,
  }
}

export const TRAY = new Set(['rejected', 'withdrawn', 'on_hold'])

export function isActive(status: string): boolean {
  return status !== 'onboarded' && !TRAY.has(status)
}

/** Pipeline order (plan.md 6.4), so dialogs can tell "at or past Selected". */
export const ORDER = [
  'new',
  'ai_shortlisted',
  'hr_review',
  'contact_pending',
  'contacted',
  'phone_screening',
  'interview_scheduled',
  'technical_interview',
  'hr_interview',
  'final_interview',
  'selected',
  'offer_sent',
  'offer_accepted',
  'onboarding',
  'onboarded',
]

export function atLeast(status: string, floor: string): boolean {
  return ORDER.indexOf(status) >= ORDER.indexOf(floor)
}

/** Moves that need more than a status: the matching dialog collects the data first (plan.md 8.4). */
export const DIALOG_MOVES: Record<string, 'contact' | 'interview' | 'offer' | 'onboarding'> = {
  contacted: 'contact',
  interview_scheduled: 'interview',
  offer_sent: 'offer',
  onboarding: 'onboarding',
}
