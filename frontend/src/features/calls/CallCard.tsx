import { CalendarCheckIcon, MessageSquareTextIcon, PhoneIcon, PlayIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { assessmentOf, turnsOf } from '@/features/calls/api'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PhoneCall } from '@/types/domain'

const STATUS_CLASS: Record<string, string> = {
  completed: 'bg-success-soft text-success',
  no_answer: 'bg-warning-soft text-warning',
  failed: 'bg-danger-soft text-danger',
  in_progress: 'bg-info-soft text-info',
  ringing: 'bg-info-soft text-info',
  queued: 'bg-surface-2 text-ink-muted',
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest ? `${minutes}m ${rest}s` : `${minutes} min`
}

export function Transcript({ call, className }: { call: PhoneCall; className?: string }) {
  const turns = turnsOf(call)
  const name = call.application.candidate.full_name.split(' ')[0]
  return (
    <ol className={cn('space-y-2', className)}>
      {turns.map((turn, index) => (
        <li
          key={index}
          className={cn('flex', turn.role === 'candidate' ? 'justify-end' : 'justify-start')}
        >
          <div
            className={cn(
              'max-w-[85%] rounded-card px-3 py-2 text-small whitespace-pre-line',
              turn.role === 'candidate'
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface-2 text-ink',
            )}
          >
            <span className="mb-0.5 block text-caption opacity-70">
              {turn.role === 'candidate' ? name : 'AI recruiter'}
            </span>
            {turn.text}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** How the call went: the summary, the interview it booked or the message it confirmed. */
export function CallOutcome({ call }: { call: PhoneCall }) {
  const assessment = assessmentOf(call)
  const interview = call.interview
  return (
    <div className="grid gap-2 text-small">
      {call.summary && <p className="text-ink">{call.summary}</p>}
      {interview ? (
        <p className="inline-flex w-fit items-center gap-1.5 rounded-pill bg-success-soft px-2 py-0.5 text-caption font-medium text-success">
          <CalendarCheckIcon aria-hidden="true" className="size-3" />
          {interview.round_label} interview booked for {formatDateTime(interview.scheduled_at)} with{' '}
          {interview.interviewer.full_name}
        </p>
      ) : (
        call.purpose === 'schedule_interview' &&
        call.status === 'completed' && (
          <p className="text-ink-muted">
            No slot was agreed.
            {assessment?.preferred_time
              ? ` The candidate prefers: ${assessment.preferred_time}`
              : ''}
          </p>
        )
      )}
      {call.purpose === 'information' &&
        typeof assessment?.information_acknowledged === 'boolean' && (
          <p className="text-ink-muted">
            {assessment.information_acknowledged
              ? 'The candidate confirmed the message.'
              : 'The candidate did not clearly confirm the message.'}
          </p>
        )}
      {assessment?.candidate_questions?.length ? (
        <p className="text-ink-muted">
          Candidate asked: {assessment.candidate_questions.join(' · ')}
        </p>
      ) : null}
    </div>
  )
}

export function CallCard({
  call,
  onResume,
}: {
  call: PhoneCall
  onResume?: (call: PhoneCall) => void
}) {
  const Icon = call.mode === 'simulated' ? MessageSquareTextIcon : PhoneIcon
  const live = call.mode === 'simulated' && call.status === 'in_progress'
  return (
    <li className="rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-5 items-center gap-1 rounded-pill bg-surface-2 px-2 text-caption text-ink-muted">
          <Icon aria-hidden="true" className="size-3" />
          {call.mode === 'simulated' ? 'Simulated' : 'Phone'}
        </span>
        <span className="text-small font-medium text-ink">{call.purpose_label}</span>
        <span
          className={cn(
            'inline-flex h-5 items-center rounded-pill px-2 text-caption font-medium',
            STATUS_CLASS[call.status] ?? 'bg-surface-2 text-ink-muted',
          )}
        >
          {call.status_label}
        </span>
        {call.duration_seconds > 0 && (
          <span className="text-caption text-ink-subtle tabular-nums">
            {formatDuration(call.duration_seconds)}
          </span>
        )}
        <span
          className="ml-auto text-caption text-ink-subtle"
          title={formatDateTime(call.created_at)}
        >
          {formatRelative(call.created_at)}
          {call.created_by ? ` · ${call.created_by.full_name}` : ''}
        </span>
      </div>
      <div className="mt-2">
        <CallOutcome call={call} />
      </div>
      {call.error && call.status === 'failed' && (
        <p className="mt-2 text-small text-danger">{call.error}</p>
      )}
      {call.notes && <p className="mt-1 text-caption text-ink-subtle">{call.notes}</p>}
      {turnsOf(call).length > 0 && (
        <details className="mt-3 text-small">
          <summary className="cursor-pointer text-ink-muted hover:text-ink">
            Transcript ({turnsOf(call).length} turns)
          </summary>
          <Transcript call={call} className="mt-2" />
        </details>
      )}
      {call.recording_url && (
        <a
          href={call.recording_url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-small text-ink underline underline-offset-2"
        >
          Recording
        </a>
      )}
      {live && onResume && (
        <div className="mt-3">
          <Button type="button" size="sm" onClick={() => onResume(call)}>
            <PlayIcon data-icon="inline-start" aria-hidden="true" />
            Continue simulated call
          </Button>
        </div>
      )}
    </li>
  )
}
