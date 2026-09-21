import { MessageSquareTextIcon, PhoneIcon, PlayIcon } from 'lucide-react'
import { MatchRing } from '@/components/shared/MatchRing'
import { Button } from '@/components/ui/button'
import { assessmentOf, turnsOf, type CallAssessment } from '@/features/calls/api'
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
const RECOMMENDATION_CLASS: Record<string, string> = {
  proceed: 'bg-success-soft text-success',
  hold: 'bg-warning-soft text-warning',
  reject: 'bg-danger-soft text-danger',
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

export function AssessmentView({ assessment }: { assessment: CallAssessment }) {
  const questions = assessment.questions ?? []
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {typeof assessment.overall_score === 'number' && questions.length > 0 && (
          <MatchRing value={assessment.overall_score} size="md" />
        )}
        <div className="min-w-0 flex-1">
          {assessment.recommendation && assessment.recommendation !== 'n/a' && (
            <span
              className={cn(
                'inline-flex h-5 items-center rounded-pill px-2 text-caption font-medium capitalize',
                RECOMMENDATION_CLASS[assessment.recommendation] ?? 'bg-surface-2 text-ink-muted',
              )}
            >
              {assessment.recommendation}
            </span>
          )}
          {assessment.summary && <p className="mt-1 text-small text-ink">{assessment.summary}</p>}
          {typeof assessment.information_acknowledged === 'boolean' && questions.length === 0 && (
            <p className="mt-1 text-small text-ink-muted">
              {assessment.information_acknowledged
                ? 'The candidate confirmed the message.'
                : 'The candidate did not clearly confirm the message.'}
            </p>
          )}
        </div>
      </div>
      {questions.length > 0 && (
        <ol className="divide-y divide-line rounded-card border border-line">
          {questions.map((item, index) => (
            <li key={index} className="grid gap-1 p-3 text-small">
              <div className="flex items-start gap-2">
                <span className="text-ink font-medium">{item.question}</span>
                <span className="ml-auto shrink-0 tabular-nums text-ink-muted">
                  {item.score}/10
                </span>
              </div>
              {item.answer_summary && <p className="text-ink-muted">{item.answer_summary}</p>}
              {item.notes && <p className="text-caption text-ink-subtle">{item.notes}</p>}
            </li>
          ))}
        </ol>
      )}
      {(assessment.strengths?.length || assessment.concerns?.length) && (
        <div className="grid gap-2 text-small sm:grid-cols-2">
          {assessment.strengths?.length ? (
            <div>
              <p className="font-medium text-ink">Strengths</p>
              <ul className="mt-1 list-disc pl-5 text-ink-muted">
                {assessment.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {assessment.concerns?.length ? (
            <div>
              <p className="font-medium text-ink">Concerns</p>
              <ul className="mt-1 list-disc pl-5 text-ink-muted">
                {assessment.concerns.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
      {assessment.candidate_questions?.length ? (
        <p className="text-small text-ink-muted">
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
  const assessment = assessmentOf(call)
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
      {call.summary && <p className="mt-2 text-small text-ink">{call.summary}</p>}
      {call.error && call.status === 'failed' && (
        <p className="mt-2 text-small text-danger">{call.error}</p>
      )}
      {call.notes && <p className="mt-1 text-caption text-ink-subtle">{call.notes}</p>}
      {assessment && (
        <div className="mt-3">
          <AssessmentView assessment={assessment} />
        </div>
      )}
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
