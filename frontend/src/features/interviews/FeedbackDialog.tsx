import { Loader2Icon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { useSubmitFeedback } from '@/features/interviews/api'
import { RECOMMENDATION_OPTIONS } from '@/features/interviews/interview-utils'
import { describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import type { Interview, Recommendation } from '@/types/domain'

export interface FeedbackDialogProps {
  interview: Interview | null
  onOpenChange: (open: boolean) => void
  onDone?: (interview: Interview) => void
}

function suggested(score: number): Recommendation {
  if (score >= 9) return 'strong_proceed'
  if (score >= 7) return 'proceed'
  if (score >= 5.5) return 'hold'
  return 'reject'
}

/** plan.md 9.11 FeedbackDialog: score slider 0 to 10 in halves, recommendation, feedback text. */
export function FeedbackDialog({ interview, onOpenChange, onDone }: FeedbackDialogProps) {
  const open = interview !== null
  const ids = { score: useId(), feedback: useId() }
  const submit = useSubmitFeedback()
  const [score, setScore] = useState(7.5)
  const [recommendation, setRecommendation] = useState<Recommendation | ''>('proceed')
  const [touched, setTouched] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      setScore(interview?.score ?? 7.5)
      setRecommendation(interview?.recommendation ?? 'proceed')
      setTouched(false)
      setFeedback(interview?.feedback ?? '')
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open, interview?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const name = interview?.application.candidate.full_name ?? ''
  const canSubmit = Boolean(recommendation) && feedback.trim().length > 0 && !submit.isPending

  async function send() {
    if (!interview || !recommendation) return
    try {
      const result = await submit.mutateAsync({
        id: interview.id,
        body: { score: score.toFixed(1), feedback: feedback.trim(), recommendation },
      })
      toast.success(`Feedback saved for ${name}: ${score}/10`)
      onDone?.(result)
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submit.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Interview feedback: {name}</DialogTitle>
          <DialogDescription>
            {interview
              ? `${interview.round_label} round with ${interview.interviewer.full_name}, ${formatDateTime(interview.scheduled_at)}. Submitting completes the interview and moves the candidate into the round's stage.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <div className="flex items-baseline justify-between">
            <FieldLabel htmlFor={ids.score}>Score</FieldLabel>
            <span className="text-h2 text-ink tabular-nums" data-slot="feedback-score">
              {score.toFixed(1)}
              <span className="text-small text-ink-subtle">/10</span>
            </span>
          </div>
          <Slider
            id={ids.score}
            aria-label="Score out of 10"
            min={0}
            max={10}
            step={0.5}
            value={[score]}
            onValueChange={([value]) => {
              setScore(value)
              if (!touched) setRecommendation(suggested(value))
            }}
          />
          <FieldDescription>
            Half points; the recommendation follows unless you change it.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Recommendation</FieldLabel>
          <SegmentedControl
            aria-label="Recommendation"
            options={RECOMMENDATION_OPTIONS}
            value={recommendation}
            onChange={(value) => {
              setTouched(true)
              setRecommendation(value)
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.feedback}>Feedback *</FieldLabel>
          <Textarea
            id={ids.feedback}
            rows={5}
            maxLength={5000}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Strengths, gaps, how they handled the exercise, and your recommendation."
          />
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={submit.isPending}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void send()}>
            {submit.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Submit feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
