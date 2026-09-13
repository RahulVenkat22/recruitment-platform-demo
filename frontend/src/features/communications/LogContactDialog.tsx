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
import { useLogCommunication } from '@/features/communications/api'
import { fromDateTimeLocal, toDateTimeLocal } from '@/lib/datetime'
import { useEnumOptions } from '@/lib/enums'
import { describeError } from '@/lib/errors'

export interface LogContactDialogProps {
  application: PipelineTarget | null
  onOpenChange: (open: boolean) => void
  onLogged?: () => void
}

const PRE_CONTACT = new Set(['new', 'ai_shortlisted', 'hr_review', 'contact_pending'])
const DIRECTIONS = [
  { key: 'outbound', label: 'Outbound' },
  { key: 'inbound', label: 'Inbound' },
] as const

function blank() {
  return {
    channel: 'phone',
    direction: 'outbound' as 'outbound' | 'inbound',
    outcome: 'connected',
    summary: '',
    notes: '',
    next_action: '',
    next_action_at: '',
    occurred_at: toDateTimeLocal(new Date()),
  }
}

/** plan.md 9.10 "Log contact": channel, direction, outcome, summary, notes, next action, date. */
export function LogContactDialog({ application, onOpenChange, onLogged }: LogContactDialogProps) {
  const open = application !== null
  const ids = {
    channel: useId(),
    outcome: useId(),
    summary: useId(),
    notes: useId(),
    next: useId(),
    nextAt: useId(),
    at: useId(),
  }
  const channels = useEnumOptions('communication_channel')
  const outcomes = useEnumOptions('communication_outcome')
  const log = useLogCommunication()
  const [form, setForm] = useState(blank)

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => setForm(blank()), 0)
    return () => window.clearTimeout(handle)
  }, [open, application?.id])

  const name = application?.candidate.full_name ?? ''
  const willMove =
    application !== null &&
    PRE_CONTACT.has(application.status) &&
    (form.outcome === 'connected' || form.outcome === 'replied')
  const canSubmit = form.summary.trim().length > 0 && !log.isPending

  async function submit() {
    if (!application) return
    try {
      await log.mutateAsync({
        application_id: application.id,
        channel: form.channel as never,
        direction: form.direction,
        outcome: form.outcome as never,
        summary: form.summary.trim(),
        notes: form.notes,
        next_action: form.next_action.trim() || null,
        next_action_at: fromDateTimeLocal(form.next_action_at) || null,
        occurred_at: fromDateTimeLocal(form.occurred_at) || null,
      })
      toast.success(`Logged contact with ${name}`)
      onLogged?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  const set = <K extends keyof ReturnType<typeof blank>>(
    key: K,
    value: ReturnType<typeof blank>[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={(next) => !log.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log contact with {name}</DialogTitle>
          <DialogDescription>
            Written to the timeline under Candidate Contact.
            {willMove ? ' A connection moves them to Contacted.' : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.channel}>Channel</FieldLabel>
            <Select value={form.channel} onValueChange={(value) => set('channel', value)}>
              <SelectTrigger id={ids.channel} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channels.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Direction</FieldLabel>
            <SegmentedControl
              aria-label="Direction"
              options={DIRECTIONS}
              value={form.direction}
              onChange={(value) => set('direction', value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.outcome}>Outcome</FieldLabel>
            <Select value={form.outcome} onValueChange={(value) => set('outcome', value)}>
              <SelectTrigger id={ids.outcome} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {outcomes.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.at}>When</FieldLabel>
            <Input
              id={ids.at}
              type="datetime-local"
              value={form.occurred_at}
              onChange={(event) => set('occurred_at', event.target.value)}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={ids.summary}>Summary *</FieldLabel>
            <Input
              id={ids.summary}
              maxLength={300}
              value={form.summary}
              onChange={(event) => set('summary', event.target.value)}
              placeholder={`Intro call with ${name.split(' ')[0] || 'the candidate'} about the role`}
              autoFocus
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={ids.notes}>Notes</FieldLabel>
            <Textarea
              id={ids.notes}
              rows={3}
              maxLength={5000}
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
              placeholder="What was discussed, interest level, notice period, expectations…"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.next}>Next action</FieldLabel>
            <Input
              id={ids.next}
              maxLength={200}
              value={form.next_action}
              onChange={(event) => set('next_action', event.target.value)}
              placeholder="Schedule technical interview"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.nextAt}>Due</FieldLabel>
            <Input
              id={ids.nextAt}
              type="datetime-local"
              value={form.next_action_at}
              onChange={(event) => set('next_action_at', event.target.value)}
            />
            <FieldDescription>Shown on the timeline as "Next: …".</FieldDescription>
          </Field>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={log.isPending}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {log.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Log contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
