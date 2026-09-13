import { Loader2Icon, SendIcon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
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
import { useCreateOffer, useOfferAction, useUpdateOffer } from '@/features/offers/api'
import { toDateInput } from '@/lib/datetime'
import { describeError } from '@/lib/errors'
import { formatCurrencyINR } from '@/lib/format'
import type { Offer } from '@/types/domain'

export interface OfferDialogProps {
  /** Make an offer for this application (ignored while `offer` is set). */
  application: PipelineTarget | null
  /** Edit an existing draft or sent offer instead. */
  offer?: Offer | null
  onOpenChange: (open: boolean) => void
  onDone?: (offer: Offer) => void
}

function defaultJoining(): string {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return toDateInput(date)
}

function blank(target: PipelineTarget | null, offer: Offer | null | undefined) {
  return {
    designation: offer?.designation ?? target?.job?.title ?? '',
    annual_ctc: offer ? String(offer.annual_ctc) : '',
    joining_date: offer ? toDateInput(offer.joining_date) : defaultJoining(),
    expires_at: offer?.expires_at ? toDateInput(offer.expires_at) : '',
    notes: offer?.notes ?? '',
  }
}

/** plan.md 8.4 OfferDialog: designation, annual CTC, joining date, expiry, notes; draft or send. */
export function OfferDialog({ application, offer, onOpenChange, onDone }: OfferDialogProps) {
  const editing = Boolean(offer)
  const open = application !== null || editing
  const target = offer?.application ?? application
  const ids = {
    designation: useId(),
    ctc: useId(),
    joining: useId(),
    expires: useId(),
    notes: useId(),
  }
  const create = useCreateOffer()
  const update = useUpdateOffer()
  const act = useOfferAction()
  const [form, setForm] = useState(() => blank(application, offer))

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => setForm(blank(application, offer)), 0)
    return () => window.clearTimeout(handle)
  }, [open, application?.id, offer?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const pending = create.isPending || update.isPending || act.isPending
  const ctc = Number(form.annual_ctc)
  const valid = form.designation.trim().length > 0 && ctc > 0 && Boolean(form.joining_date)
  const name = target?.candidate.full_name ?? ''
  const set = <K extends keyof ReturnType<typeof blank>>(key: K, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  async function submit(send: boolean) {
    if (!valid) return
    const body = {
      designation: form.designation.trim(),
      annual_ctc: Math.round(ctc),
      currency: 'INR',
      joining_date: form.joining_date,
      expires_at: form.expires_at ? new Date(`${form.expires_at}T18:00:00`).toISOString() : null,
      notes: form.notes,
    }
    try {
      let result: Offer
      if (offer) {
        result = await update.mutateAsync({ id: offer.id, body })
        if (send && result.status === 'draft') {
          result = await act.mutateAsync({ id: offer.id, action: 'send' })
        }
      } else if (application) {
        result = await create.mutateAsync({ ...body, application_id: application.id, send })
      } else {
        return
      }
      toast.success(
        send ? `Offer sent to ${name}` : `Offer ${offer ? 'updated' : 'drafted'} for ${name}`,
      )
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
            {editing ? 'Edit offer' : 'Make an offer'}: {name}
          </DialogTitle>
          <DialogDescription>
            Sending moves the candidate to Offer Sent and notifies the owner. A draft stays private
            until you send it.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={ids.designation}>Designation *</FieldLabel>
            <Input
              id={ids.designation}
              maxLength={120}
              value={form.designation}
              onChange={(event) => set('designation', event.target.value)}
              autoFocus
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.ctc}>Annual CTC (INR) *</FieldLabel>
            <Input
              id={ids.ctc}
              type="number"
              min={1}
              step={50000}
              inputMode="numeric"
              value={form.annual_ctc}
              onChange={(event) => set('annual_ctc', event.target.value)}
              placeholder="2600000"
            />
            <FieldDescription>
              {ctc > 0 ? `${formatCurrencyINR(ctc)} per year` : 'Per year, before tax.'}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.joining}>Joining date *</FieldLabel>
            <Input
              id={ids.joining}
              type="date"
              value={form.joining_date}
              onChange={(event) => set('joining_date', event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.expires}>Offer valid until</FieldLabel>
            <Input
              id={ids.expires}
              type="date"
              value={form.expires_at}
              onChange={(event) => set('expires_at', event.target.value)}
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
              placeholder="Joining bonus, relocation support, variable pay…"
            />
          </Field>
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
          {(!offer || offer.status === 'draft') && (
            <Button
              type="button"
              variant="outline"
              disabled={!valid || pending}
              onClick={() => void submit(false)}
            >
              {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              {offer ? 'Save draft' : 'Save as draft'}
            </Button>
          )}
          <Button type="button" disabled={!valid || pending} onClick={() => void submit(true)}>
            {pending ? (
              <Loader2Icon aria-hidden="true" className="animate-spin" />
            ) : (
              <SendIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {offer && offer.status !== 'draft' ? 'Save changes' : 'Send offer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
