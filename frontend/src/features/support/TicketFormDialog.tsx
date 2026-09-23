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
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useJobList } from '@/features/jobs/api'
import { useCreateTicket, useUpdateTicket } from '@/features/support/api'
import { PRIORITY_ORDER } from '@/features/support/support-utils'
import { useEnumOptions } from '@/lib/enums'
import { describeError } from '@/lib/errors'
import type { TicketCategory, TicketDetail, TicketPriority } from '@/types/domain'

export interface TicketFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing an existing ticket; omit to raise a new one. */
  ticket?: TicketDetail | null
  onSaved?: (ticket: TicketDetail) => void
}

const NO_JOB = '__none__'
const SUBJECT_MAX = 200
const DESCRIPTION_MAX = 5000

/** Raise a ticket, or edit one: subject, category, priority, the related role and the details. */
export function TicketFormDialog({ open, onOpenChange, ticket, onSaved }: TicketFormDialogProps) {
  const ids = { subject: useId(), category: useId(), job: useId(), description: useId() }
  const editing = Boolean(ticket)
  const create = useCreateTicket()
  const update = useUpdateTicket()
  const pending = create.isPending || update.isPending
  const categories = useEnumOptions('ticket_category')
  const priorities = useEnumOptions('ticket_priority')
  const jobs = useJobList({ page_size: 100, ordering: 'title' })

  const [subject, setSubject] = useState('')
  const [category, setCategory] = useState<TicketCategory>('other')
  const [priority, setPriority] = useState<TicketPriority>('medium')
  const [job, setJob] = useState(NO_JOB)
  const [description, setDescription] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      setSubject(ticket?.subject ?? '')
      setCategory(ticket?.category ?? 'other')
      setPriority(ticket?.priority ?? 'medium')
      setJob(ticket?.job?.id ?? NO_JOB)
      setDescription(ticket?.description ?? '')
      setTried(false)
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open, ticket?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const subjectError = subject.trim() ? null : 'Give the ticket a subject.'
  const descriptionError = description.trim() ? null : 'Describe what you need help with.'
  const priorityOptions = PRIORITY_ORDER.map((key) => ({
    key,
    label: priorities.find((option) => option.key === key)?.label ?? key,
  }))

  async function submit() {
    setTried(true)
    if (subjectError || descriptionError || pending) return
    const body = {
      subject: subject.trim(),
      description: description.trim(),
      category,
      priority,
      job_description_id: job === NO_JOB ? null : job,
    }
    try {
      const saved = ticket
        ? await update.mutateAsync({ id: ticket.id, body })
        : await create.mutateAsync(body)
      toast.success(ticket ? `${saved.number} updated` : `${saved.number} raised`)
      onOpenChange(false)
      onSaved?.(saved)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${ticket?.number}` : 'New support ticket'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Changes are recorded on the ticket timeline.'
              : 'The support team is notified the moment you raise it; you get a ticket number to track it by.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field data-invalid={tried && subjectError ? true : undefined}>
            <FieldLabel htmlFor={ids.subject}>Subject *</FieldLabel>
            <Input
              id={ids.subject}
              value={subject}
              maxLength={SUBJECT_MAX}
              autoFocus
              placeholder="One line that says what is wrong or needed"
              aria-invalid={tried && subjectError ? true : undefined}
              onChange={(event) => setSubject(event.target.value)}
            />
            {tried && subjectError && <FieldError>{subjectError}</FieldError>}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={ids.category}>Category</FieldLabel>
              <Select
                value={category}
                onValueChange={(value) => setCategory(value as TicketCategory)}
              >
                <SelectTrigger id={ids.category} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.job}>Related job description</FieldLabel>
              <Select value={job} onValueChange={setJob} disabled={jobs.isError}>
                <SelectTrigger id={ids.job} className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_JOB}>None</SelectItem>
                  {(jobs.data?.results ?? []).map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel>Priority</FieldLabel>
            <SegmentedControl
              aria-label="Priority"
              options={priorityOptions}
              value={priority}
              onChange={setPriority}
            />
            <FieldDescription>
              Urgent means someone is blocked today; the support team sees the priority first.
            </FieldDescription>
          </Field>
          <Field data-invalid={tried && descriptionError ? true : undefined}>
            <FieldLabel htmlFor={ids.description}>Details *</FieldLabel>
            <Textarea
              id={ids.description}
              rows={6}
              maxLength={DESCRIPTION_MAX}
              value={description}
              aria-invalid={tried && descriptionError ? true : undefined}
              placeholder="What happened, where, and what you expected. Names of candidates or roles help."
              onChange={(event) => setDescription(event.target.value)}
            />
            {tried && descriptionError && <FieldError>{descriptionError}</FieldError>}
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {editing ? 'Save changes' : 'Raise ticket'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
