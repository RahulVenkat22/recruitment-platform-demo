import type { RowAction } from '@/components/shared/ActionMenu'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import type { Interview } from '@/types/domain'

export const DURATION_OPTIONS = [30, 45, 60, 90, 120] as const

export const MODE_OPTIONS = [
  { key: 'video', label: 'Video' },
  { key: 'phone', label: 'Phone' },
  { key: 'onsite', label: 'On-site' },
] as const

export const RECOMMENDATION_OPTIONS = [
  { key: 'strong_proceed', label: 'Strong proceed', tone: '#15803D' },
  { key: 'proceed', label: 'Proceed', tone: '#1F7A4D' },
  { key: 'hold', label: 'Hold', tone: '#8A5A0B' },
  { key: 'reject', label: 'Reject', tone: '#B42318' },
] as const

export const RECOMMENDATION_CLASS: Record<string, string> = {
  strong_proceed: 'bg-success-soft text-success',
  proceed: 'bg-success-soft text-success',
  hold: 'bg-warning-soft text-warning',
  reject: 'bg-danger-soft text-danger',
}

export const INTERVIEW_STATUS_CLASS: Record<string, string> = {
  scheduled: 'bg-info-soft text-info',
  rescheduled: 'bg-warning-soft text-warning',
  completed: 'bg-success-soft text-success',
  cancelled: 'bg-surface-2 text-ink-muted',
  no_show: 'bg-danger-soft text-danger',
}

export const OPEN_INTERVIEW = new Set(['scheduled', 'rescheduled'])

export function isOpen(interview: Interview): boolean {
  return OPEN_INTERVIEW.has(interview.status)
}

/** A scored interview shows "8.5/10"; an unscored one nothing. */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return ''
  return `${Number.isInteger(score) ? score : score.toFixed(1)}/10`
}

/** Meeting links for future open interviews get a "Join" button. */
export function canJoin(interview: Interview, now = new Date()): boolean {
  if (!interview.meeting_link || !isOpen(interview)) return false
  const start = new Date(interview.scheduled_at).getTime()
  const end = start + interview.duration_minutes * 60_000
  return now.getTime() <= end
}

export function candidateHrefFor(interview: Interview): string {
  return `/candidates/${interview.application.candidate.id}?jd=${interview.application.job_description}&tab=interviews`
}

export function interviewActions(
  interview: Interview,
  actions: ApplicationActionsHandle,
): RowAction[] {
  const items: RowAction[] = []
  const open = isOpen(interview)
  if (interview.permissions.can_submit_feedback && interview.status !== 'cancelled') {
    items.push({
      key: 'feedback',
      label: interview.status === 'completed' ? 'Edit feedback…' : 'Submit feedback…',
      onSelect: () => actions.submitFeedback(interview),
    })
  }
  if (interview.permissions.can_manage && open) {
    items.push({
      key: 'reschedule',
      label: 'Reschedule…',
      onSelect: () => actions.rescheduleInterview(interview),
    })
    items.push({
      key: 'cancel',
      label: 'Cancel interview…',
      destructive: true,
      separatorBefore: true,
      onSelect: () => actions.cancelInterview(interview),
    })
  }
  if (interview.permissions.can_manage && interview.status === 'cancelled') {
    items.push({
      key: 'delete',
      label: 'Remove',
      destructive: true,
      onSelect: () => void actions.deleteInterview(interview),
    })
  }
  return items
}
