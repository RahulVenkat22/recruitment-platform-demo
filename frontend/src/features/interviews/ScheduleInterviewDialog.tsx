import { Loader2Icon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { UserSelect } from '@/components/shared/UserSelect'
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
import { useRescheduleInterview, useScheduleInterview } from '@/features/interviews/api'
import { DURATION_OPTIONS, MODE_OPTIONS } from '@/features/interviews/interview-utils'
import { useJob } from '@/features/jobs/api'
import { fromDateTimeLocal, nextWorkingSlot, toDateTimeLocal } from '@/lib/datetime'
import { useEnumOptions } from '@/lib/enums'
import { describeError } from '@/lib/errors'
import { useUsersDirectory } from '@/lib/users'
import type { Interview, UserRow } from '@/types/domain'

export interface ScheduleInterviewDialogProps {
  /** Schedule a new round for this application (ignored while `interview` is set). */
  application: PipelineTarget | null
  /** Reschedule this interview instead. */
  interview?: Interview | null
  onOpenChange: (open: boolean) => void
  onDone?: (interview: Interview) => void
}

function blank(interview: Interview | null | undefined) {
  return {
    round: interview?.round ?? 'technical',
    interviewer: interview?.interviewer.id ?? '',
    scheduled_at: toDateTimeLocal(interview ? interview.scheduled_at : nextWorkingSlot()),
    duration_minutes: String(interview?.duration_minutes ?? 60),
    mode: (interview?.mode ?? 'video') as 'video' | 'phone' | 'onsite',
    meeting_link: interview?.meeting_link ?? '',
    location: interview?.location ?? '',
    note: '',
  }
}

/**
 * plan.md 9.11 ScheduleInterviewDialog: round, interviewer (participants and
 * interviewers of the JD), date and time, duration, mode, link. The same form
 * reschedules an existing interview.
 */
export function ScheduleInterviewDialog({
  application,
  interview,
  onOpenChange,
  onDone,
}: ScheduleInterviewDialogProps) {
  const rescheduling = Boolean(interview)
  const open = application !== null || rescheduling
  const target = interview?.application ?? application
  const ids = {
    round: useId(),
    interviewer: useId(),
    at: useId(),
    duration: useId(),
    link: useId(),
    location: useId(),
    note: useId(),
  }
  const rounds = useEnumOptions('interview_round')
  const job = useJob(target?.job_description, { enabled: open && !rescheduling })
  const directory = useUsersDirectory(open && !rescheduling)
  const schedule = useScheduleInterview()
  const reschedule = useRescheduleInterview()
  const [form, setForm] = useState(() => blank(interview))

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => setForm(blank(interview)), 0)
    return () => window.clearTimeout(handle)
  }, [open, application?.id, interview?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const pending = schedule.isPending || reschedule.isPending
  const canSubmit =
    Boolean(form.scheduled_at) && (rescheduling || Boolean(form.interviewer)) && !pending
  const name = target?.candidate.full_name ?? ''
  const set = <K extends keyof ReturnType<typeof blank>>(
    key: K,
    value: ReturnType<typeof blank>[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }))

  async function submit() {
    const scheduledAt = fromDateTimeLocal(form.scheduled_at)
    if (!scheduledAt) return
    try {
      let result: Interview
      if (interview) {
        result = await reschedule.mutateAsync({
          id: interview.id,
          body: {
            scheduled_at: scheduledAt,
            duration_minutes: Number(form.duration_minutes),
            mode: form.mode,
            meeting_link: form.mode === 'video' ? form.meeting_link || null : null,
            location: form.mode === 'onsite' ? form.location || null : null,
            note: form.note,
          },
        })
        toast.success(`Rescheduled the ${result.round_label.toLowerCase()} interview for ${name}`)
      } else if (application) {
        result = await schedule.mutateAsync({
          application_id: application.id,
          round: form.round as never,
          interviewer_id: form.interviewer,
          scheduled_at: scheduledAt,
          duration_minutes: Number(form.duration_minutes),
          mode: form.mode,
          meeting_link: form.mode === 'video' ? form.meeting_link || null : null,
          location: form.mode === 'onsite' ? form.location || null : null,
        })
        toast.success(`${result.round_label} interview scheduled for ${name}`)
      } else {
        return
      }
      onDone?.(result)
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {rescheduling
              ? `Reschedule ${interview?.round_label.toLowerCase()} interview`
              : 'Schedule interview'}
            {name ? `: ${name}` : ''}
          </DialogTitle>
          <DialogDescription>
            {rescheduling
              ? 'The interviewer and the candidate owner are notified of the new time.'
              : 'The interviewer and the owner are notified; an earlier candidate moves to Interview Scheduled.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {!rescheduling && (
            <>
              <Field>
                <FieldLabel htmlFor={ids.round}>Round</FieldLabel>
                <Select value={form.round} onValueChange={(value) => set('round', value as never)}>
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
                  value={form.interviewer}
                  onChange={(value) => set('interviewer', value)}
                  options={interviewers}
                  placeholder={
                    job.isPending || directory.isPending ? 'Loading…' : 'Choose an interviewer'
                  }
                />
              </Field>
            </>
          )}
          <Field>
            <FieldLabel htmlFor={ids.at}>Date and time</FieldLabel>
            <Input
              id={ids.at}
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(event) => set('scheduled_at', event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.duration}>Duration</FieldLabel>
            <Select
              value={form.duration_minutes}
              onValueChange={(value) => set('duration_minutes', value)}
            >
              <SelectTrigger id={ids.duration} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((minutes) => (
                  <SelectItem key={minutes} value={String(minutes)}>
                    {minutes} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>Mode</FieldLabel>
            <SegmentedControl
              aria-label="Interview mode"
              options={MODE_OPTIONS}
              value={form.mode}
              onChange={(value) => set('mode', value)}
            />
          </Field>
          {form.mode === 'video' && (
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={ids.link}>Meeting link</FieldLabel>
              <Input
                id={ids.link}
                type="url"
                value={form.meeting_link}
                onChange={(event) => set('meeting_link', event.target.value)}
                placeholder="https://meet.aimious.demo/…"
              />
            </Field>
          )}
          {form.mode === 'onsite' && (
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={ids.location}>Location</FieldLabel>
              <Input
                id={ids.location}
                maxLength={160}
                value={form.location}
                onChange={(event) => set('location', event.target.value)}
                placeholder="Chennai office, meeting room 3"
              />
            </Field>
          )}
          {rescheduling && (
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={ids.note}>Note</FieldLabel>
              <Textarea
                id={ids.note}
                rows={2}
                maxLength={500}
                value={form.note}
                onChange={(event) => set('note', event.target.value)}
                placeholder="Why the change? Shown on the timeline."
              />
              <FieldDescription>Optional.</FieldDescription>
            </Field>
          )}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {rescheduling ? 'Reschedule' : 'Schedule interview'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
