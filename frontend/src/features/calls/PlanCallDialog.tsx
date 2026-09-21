import {
  Loader2Icon,
  MessageSquareTextIcon,
  PhoneOutgoingIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { PipelineTarget } from '@/features/applications/pipeline-target'
import { useBulkCall, useStartCall, useVoiceConfig } from '@/features/calls/api'
import { describeError } from '@/lib/errors'
import type { PhoneCall, VoiceConfig } from '@/types/domain'

type Purpose = 'knowledge_test' | 'information'

const PURPOSES = [
  { key: 'knowledge_test', label: 'Knowledge test' },
  { key: 'information', label: 'Share information' },
] as const
const MINUTES = ['5', '10', '15', '20'] as const

function VoiceNotice({ config }: { config: VoiceConfig | undefined }) {
  if (!config) return null
  if (!config.configured) {
    return (
      <Alert>
        <TriangleAlertIcon aria-hidden="true" />
        <AlertDescription>
          No voice provider is connected, so real phone calls are off. A simulated call runs the
          same AI interview as a chat here, so you can test the script and the assessment.
        </AlertDescription>
      </Alert>
    )
  }
  if (config.safe_number) {
    return (
      <Alert>
        <ShieldAlertIcon aria-hidden="true" />
        <AlertDescription>
          Safe mode is on: real calls are placed to <strong>{config.safe_number}</strong> instead of
          the candidate. Remove VOICE_SAFE_NUMBER to go live.
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

export interface PlanCallDialogProps {
  targets: PipelineTarget[] | null
  onOpenChange: (open: boolean) => void
  onDone?: () => void
  /** A simulated call was started: open the chat for it. */
  onSimulated?: (call: PhoneCall) => void
}

/**
 * Plan an AI phone call: what it is for, what to ask or say, how long. One
 * candidate can also get a simulated call, which runs the interview as a chat.
 */
export function PlanCallDialog({
  targets,
  onOpenChange,
  onDone,
  onSimulated,
}: PlanCallDialogProps) {
  const open = targets !== null && targets.length > 0
  const start = useStartCall()
  const bulk = useBulkCall()
  const busy = start.isPending || bulk.isPending
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        {targets && targets.length > 0 && (
          <PlanForm
            key={targets.map((target) => target.id).join(',')}
            targets={targets}
            busy={busy}
            onCancel={() => onOpenChange(false)}
            onSimulate={async (body) => {
              try {
                const call = await start.mutateAsync({
                  id: targets[0].id,
                  ...body,
                  mode: 'simulated',
                })
                onOpenChange(false)
                onSimulated?.(call)
              } catch (error) {
                toast.error(describeError(error))
              }
            }}
            onPhone={async (body) => {
              try {
                if (targets.length === 1) {
                  const call = await start.mutateAsync({
                    id: targets[0].id,
                    ...body,
                    mode: 'phone',
                  })
                  toast.success(
                    call.status === 'failed'
                      ? `Call to ${targets[0].candidate.full_name} could not be placed`
                      : `Calling ${targets[0].candidate.full_name}…`,
                  )
                } else {
                  const result = await bulk.mutateAsync({
                    ids: targets.map((target) => target.id),
                    ...body,
                    mode: 'phone',
                  })
                  const skipped = Object.keys(result.skipped).length
                  toast.success(
                    `Placed ${result.placed.length} ${result.placed.length === 1 ? 'call' : 'calls'}` +
                      (skipped ? `, ${skipped} skipped` : ''),
                    skipped
                      ? { description: Object.values(result.skipped).slice(0, 3).join(' · ') }
                      : undefined,
                  )
                }
                onDone?.()
                onOpenChange(false)
              } catch (error) {
                toast.error(describeError(error))
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface PlanBody {
  purpose: Purpose
  questions: string[]
  information: string
  instructions: string
  max_minutes: number
}

function PlanForm({
  targets,
  busy,
  onCancel,
  onSimulate,
  onPhone,
}: {
  targets: PipelineTarget[]
  busy: boolean
  onCancel: () => void
  onSimulate: (body: PlanBody) => Promise<void>
  onPhone: (body: PlanBody) => Promise<void>
}) {
  const ids = { questions: useId(), info: useId(), notes: useId(), minutes: useId() }
  const config = useVoiceConfig()
  const [purpose, setPurpose] = useState<Purpose>('knowledge_test')
  const [questions, setQuestions] = useState('')
  const [information, setInformation] = useState('')
  const [instructions, setInstructions] = useState('')
  const [minutes, setMinutes] = useState<(typeof MINUTES)[number]>('10')
  const single = targets.length === 1
  const names = targets.map((target) => target.candidate.full_name)
  const questionList = questions
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)
  const valid = purpose === 'knowledge_test' || information.trim().length > 0
  const body: PlanBody = {
    purpose,
    questions: purpose === 'knowledge_test' ? questionList : [],
    information: purpose === 'information' ? information.trim() : '',
    instructions: instructions.trim(),
    max_minutes: Number(minutes),
  }
  const phoneReady = Boolean(config.data?.configured)

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {single ? `AI call to ${names[0]}` : `AI call to ${targets.length} candidates`}
        </DialogTitle>
        <DialogDescription>
          {single
            ? 'The AI speaks with the candidate, follows up on their answers and logs a summary.'
            : `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} each get the same call, one at a time.`}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <VoiceNotice config={config.data} />
        <Field>
          <FieldLabel>Purpose of the call</FieldLabel>
          <SegmentedControl
            aria-label="Purpose"
            options={PURPOSES}
            value={purpose}
            onChange={setPurpose}
          />
          <FieldDescription>
            {purpose === 'knowledge_test'
              ? 'A friendly screening: your questions first, then questions from the job description, with one follow-up whenever an answer is vague.'
              : 'The AI delivers your message, confirms the candidate understood it and answers simple logistics questions.'}
          </FieldDescription>
        </Field>
        {purpose === 'knowledge_test' ? (
          <Field>
            <FieldLabel htmlFor={ids.questions}>Questions to ask</FieldLabel>
            <Textarea
              id={ids.questions}
              rows={5}
              maxLength={4000}
              value={questions}
              onChange={(event) => setQuestions(event.target.value)}
              placeholder={
                'One per line, for example:\nHow do you design a CI/CD pipeline for microservices?\nWhat is the difference between a Docker image and a container?'
              }
            />
            <FieldDescription>
              {questionList.length
                ? `${questionList.length} ${questionList.length === 1 ? 'question' : 'questions'}; the AI adds two to four more from the role.`
                : 'Leave empty and the AI asks only about the role.'}
            </FieldDescription>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor={ids.info}>What to tell the candidate *</FieldLabel>
            <Textarea
              id={ids.info}
              rows={4}
              maxLength={3000}
              value={information}
              onChange={(event) => setInformation(event.target.value)}
              placeholder="You have a technical interview today at 5 pm with Arun over Google Meet; the link is in your email. Please join five minutes early."
            />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field>
            <FieldLabel htmlFor={ids.notes}>Extra instructions</FieldLabel>
            <Textarea
              id={ids.notes}
              rows={2}
              maxLength={2000}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Mention the team is fully remote; do not discuss salary."
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.minutes}>Max length</FieldLabel>
            <Select value={minutes} onValueChange={(value) => setMinutes(value as typeof minutes)}>
              <SelectTrigger id={ids.minutes} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MINUTES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {single && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || !valid}
            onClick={() => void onSimulate(body)}
          >
            <MessageSquareTextIcon data-icon="inline-start" aria-hidden="true" />
            Run simulated call
          </Button>
        )}
        <Button
          type="button"
          disabled={busy || !valid || !phoneReady}
          title={phoneReady ? undefined : 'Connect a voice provider to place real calls'}
          onClick={() => void onPhone(body)}
        >
          {busy ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <PhoneOutgoingIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {single ? 'Place phone call' : `Call ${targets.length} candidates`}
        </Button>
      </DialogFooter>
    </>
  )
}
