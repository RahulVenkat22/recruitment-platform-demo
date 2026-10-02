import {
  Loader2Icon,
  MessageSquareTextIcon,
  PhoneOutgoingIcon,
  ShieldAlertIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { UserSelect } from '@/components/shared/UserSelect'
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
import { Input } from '@/components/ui/input'
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
import { DURATION_OPTIONS, MODE_OPTIONS } from '@/features/interviews/interview-utils'
import { useJob } from '@/features/jobs/api'
import { useAuthStore } from '@/lib/auth-store'
import { fromDateTimeLocal, nextWorkingSlot, toDateTimeLocal } from '@/lib/datetime'
import { useEnumOptions } from '@/lib/enums'
import { describeError } from '@/lib/errors'
import { useUsersDirectory } from '@/lib/users'
import type { PhoneCall, PhoneCallCreateRequest, UserRow, VoiceConfig } from '@/types/domain'

type Purpose = 'schedule_interview' | 'information'

const PURPOSES = [
  { key: 'schedule_interview', label: 'Schedule interview' },
  { key: 'information', label: 'Share information' },
] as const
const MINUTES = ['5', '10', '15', '20'] as const

/** Three slots to offer by default: the next working day morning and afternoon, then the day after. */
function defaultSlots(): string[] {
  const first = nextWorkingSlot()
  const afternoon = new Date(first)
  afternoon.setHours(15, 0, 0, 0)
  return [first, afternoon, nextWorkingSlot(first)].map(toDateTimeLocal)
}

function VoiceNotice({ config }: { config: VoiceConfig | undefined }) {
  if (!config) return null
  if (!config.configured) {
    return (
      <Alert>
        <TriangleAlertIcon aria-hidden="true" />
        <AlertDescription>
          No voice provider is connected, so real phone calls are off. A simulated call runs the
          same AI conversation as a chat here, so you can test the script and the outcome.
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
 * Plan an AI phone call: fix an interview time from slots you offer, or deliver
 * a message. One candidate can also get a simulated call, which runs the
 * conversation as a chat.
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

type PlanBody = Omit<PhoneCallCreateRequest, 'mode'>

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
  const ids = {
    slots: useId(),
    round: useId(),
    interviewer: useId(),
    duration: useId(),
    info: useId(),
    notes: useId(),
    minutes: useId(),
  }
  const config = useVoiceConfig()
  const rounds = useEnumOptions('interview_round')
  const job = useJob(targets[0].job_description)
  const directory = useUsersDirectory()
  const me = useAuthStore((state) => state.user?.id ?? '')
  const [purpose, setPurpose] = useState<Purpose>('schedule_interview')
  const [slots, setSlots] = useState<string[]>(defaultSlots)
  const [round, setRound] = useState('technical')
  const [interviewer, setInterviewer] = useState(me)
  const [duration, setDuration] = useState('60')
  const [mode, setMode] = useState<'video' | 'phone' | 'onsite'>('video')
  const [information, setInformation] = useState('')
  const [instructions, setInstructions] = useState('')
  const [minutes, setMinutes] = useState<(typeof MINUTES)[number]>('10')
  const single = targets.length === 1
  const names = targets.map((target) => target.candidate.full_name)

  const interviewers = useMemo<UserRow[]>(() => {
    const people = new Map<string, UserRow>()
    for (const participant of job.data?.participants ?? []) {
      people.set(participant.user.id, participant.user)
    }
    for (const user of directory.data ?? []) {
      if (user.role === 'interviewer' || user.role === 'hr_admin' || user.role === 'hr') {
        people.set(user.id, user)
      }
    }
    return [...people.values()]
  }, [job.data, directory.data])

  const scheduling = purpose === 'schedule_interview'
  const valid = scheduling
    ? slots.every(Boolean) && Boolean(interviewer)
    : information.trim().length > 0
  const body: PlanBody = {
    purpose,
    slots: scheduling ? slots.map(fromDateTimeLocal) : [],
    interview_round: scheduling ? (round as PlanBody['interview_round']) : '',
    interviewer: scheduling ? interviewer : null,
    interview_duration_minutes: Number(duration),
    interview_mode: mode,
    information: scheduling ? '' : information.trim(),
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
            ? 'The AI speaks with the candidate, answers their questions about the company and the role, and logs a summary.'
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
            {scheduling
              ? 'The AI offers your time slots, the candidate picks one, and the interview is booked at that time when the call ends.'
              : 'The AI delivers your message, confirms the candidate understood it and answers simple logistics questions.'}
          </FieldDescription>
        </Field>
        {scheduling ? (
          <>
            <Field>
              <FieldLabel htmlFor={ids.slots}>Time slots to offer</FieldLabel>
              <div className="grid gap-2 sm:grid-cols-3">
                {slots.map((slot, index) => (
                  <Input
                    key={index}
                    id={index === 0 ? ids.slots : undefined}
                    aria-label={`Slot ${index + 1}`}
                    type="datetime-local"
                    value={slot}
                    onChange={(event) =>
                      setSlots((prev) => prev.map((s, i) => (i === index ? event.target.value : s)))
                    }
                  />
                ))}
              </div>
              <FieldDescription>Offered in this order; the candidate chooses one.</FieldDescription>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor={ids.round}>Round</FieldLabel>
                <Select value={round} onValueChange={setRound}>
                  <SelectTrigger id={ids.round} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {rounds.map((option) => (
                      <SelectItem key={option.key} value={option.key}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.interviewer}>Interviewer</FieldLabel>
                <UserSelect
                  id={ids.interviewer}
                  value={interviewer}
                  onChange={setInterviewer}
                  options={interviewers}
                  placeholder={
                    job.isPending || directory.isPending ? 'Loading…' : 'Choose an interviewer'
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.duration}>Duration</FieldLabel>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger id={ids.duration} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Mode</FieldLabel>
                <SegmentedControl
                  aria-label="Interview mode"
                  options={MODE_OPTIONS}
                  value={mode}
                  onChange={setMode}
                />
              </Field>
            </div>
          </>
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
