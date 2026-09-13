import { Loader2Icon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
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
import { Textarea } from '@/components/ui/textarea'
import type { PipelineTarget } from '@/features/applications/pipeline-target'
import { useStartOnboarding } from '@/features/onboarding/api'
import { useAuthStore } from '@/lib/auth-store'
import { toDateInput } from '@/lib/datetime'
import { describeError } from '@/lib/errors'
import { useUsersDirectory } from '@/lib/users'
import type { Onboarding } from '@/types/domain'

export interface StartOnboardingDialogProps {
  application: PipelineTarget | null
  /** Usually the offer's joining date. */
  defaultStartDate?: string | null
  onOpenChange: (open: boolean) => void
  onDone?: (onboarding: Onboarding) => void
}

/** plan.md 8.4 StartOnboardingDialog: start date, buddy, HR contact, notes; opens the checklist. */
export function StartOnboardingDialog({
  application,
  defaultStartDate,
  onOpenChange,
  onDone,
}: StartOnboardingDialogProps) {
  const open = application !== null
  const ids = { start: useId(), buddy: useId(), hr: useId(), notes: useId() }
  const me = useAuthStore((state) => state.user)
  const directory = useUsersDirectory(open)
  const start = useStartOnboarding()
  const [form, setForm] = useState({ start_date: '', buddy: '', hr_contact: '', notes: '' })

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(
      () =>
        setForm({
          start_date: toDateInput(defaultStartDate ?? null) || toDateInput(new Date()),
          buddy: '',
          hr_contact: me?.id ?? '',
          notes: '',
        }),
      0,
    )
    return () => window.clearTimeout(handle)
  }, [open, application?.id, defaultStartDate, me?.id])

  const people = useMemo(() => directory.data ?? [], [directory.data])
  const hrPeople = useMemo(
    () => people.filter((user) => user.role === 'hr' || user.role === 'hr_admin'),
    [people],
  )
  const name = application?.candidate.full_name ?? ''
  const canSubmit = Boolean(form.start_date) && !start.isPending

  async function submit() {
    if (!application) return
    try {
      const result = await start.mutateAsync({
        application_id: application.id,
        start_date: form.start_date,
        buddy_id: form.buddy || null,
        hr_contact_id: form.hr_contact || null,
        notes: form.notes,
      })
      toast.success(`Onboarding started for ${name}`)
      onDone?.(result)
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !start.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start onboarding: {name}</DialogTitle>
          <DialogDescription>
            Creates the five-step checklist (offer letter, documents, background check, laptop and
            accounts, day-one orientation) and moves the candidate to Onboarding.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.start}>Start date *</FieldLabel>
            <Input
              id={ids.start}
              type="date"
              value={form.start_date}
              onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.hr}>HR contact</FieldLabel>
            <UserSelect
              id={ids.hr}
              value={form.hr_contact}
              onChange={(value) => setForm((prev) => ({ ...prev, hr_contact: value }))}
              options={hrPeople}
              placeholder={directory.isPending ? 'Loading…' : 'Choose HR contact'}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={ids.buddy}>Buddy</FieldLabel>
            <UserSelect
              id={ids.buddy}
              value={form.buddy}
              onChange={(value) => setForm((prev) => ({ ...prev, buddy: value }))}
              options={people}
              placeholder={directory.isPending ? 'Loading…' : 'Choose a buddy (optional)'}
            />
            <FieldDescription>A teammate who helps during the first weeks.</FieldDescription>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={ids.notes}>Notes</FieldLabel>
            <Textarea
              id={ids.notes}
              rows={3}
              maxLength={5000}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Laptop model, access requests, first-week plan…"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={start.isPending}
          >
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={() => void submit()}>
            {start.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Start onboarding
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
