import { Loader2Icon } from 'lucide-react'
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
import { Field, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { useOfferAction, type OfferAction } from '@/features/offers/api'
import { describeError } from '@/lib/errors'
import type { Offer } from '@/types/domain'

export interface OfferActionDialogProps {
  offer: Offer | null
  action: Exclude<OfferAction, 'send'> | null
  onOpenChange: (open: boolean) => void
  onDone?: (offer: Offer) => void
}

const COPY: Record<
  Exclude<OfferAction, 'send'>,
  {
    title: string
    description: string
    label: string
    field: string
    required: boolean
    destructive: boolean
  }
> = {
  accept: {
    title: 'Mark offer accepted',
    description: 'The candidate moves to Offer Accepted; the owner and the JD owner are notified.',
    label: 'Mark accepted',
    field: 'Note (optional)',
    required: false,
    destructive: false,
  },
  decline: {
    title: 'Mark offer declined',
    description: 'The candidate is withdrawn with the reason "Offer declined".',
    label: 'Mark declined',
    field: 'Reason *',
    required: true,
    destructive: true,
  },
  withdraw: {
    title: 'Withdraw the offer',
    description:
      'The offer is closed; the candidate stays where they are so you can decide next steps.',
    label: 'Withdraw offer',
    field: 'Reason *',
    required: true,
    destructive: true,
  },
}

/** Accept, decline or withdraw an offer with a note or reason for the timeline. */
export function OfferActionDialog({ offer, action, onOpenChange, onDone }: OfferActionDialogProps) {
  const open = offer !== null && action !== null
  const id = useId()
  const act = useOfferAction()
  const [text, setText] = useState('')

  useEffect(() => {
    if (open) return
    const handle = window.setTimeout(() => setText(''), 0)
    return () => window.clearTimeout(handle)
  }, [open])

  // The caller clears `offer` and `action` together on close; remembering the
  // last pair keeps the title and description filled while the dialog fades out.
  const [shown, setShown] = useState<{
    offer: Offer
    action: Exclude<OfferAction, 'send'>
  } | null>(null)
  if (offer && action && (shown?.offer !== offer || shown?.action !== action)) {
    setShown({ offer, action })
  }
  const current = offer && action ? { offer, action } : shown
  const copy = current ? COPY[current.action] : null
  const name = current?.offer.application.candidate.full_name ?? ''
  const canSubmit = Boolean(copy) && (!copy?.required || text.trim().length > 0) && !act.isPending

  async function submit() {
    if (!offer || !action) return
    try {
      const result = await act.mutateAsync({
        id: offer.id,
        action,
        reason: action === 'accept' ? undefined : text.trim(),
        note: action === 'accept' ? text.trim() : undefined,
      })
      toast.success(`${copy?.label ?? 'Done'}: ${offer.application.candidate.full_name}`)
      onDone?.(result)
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !act.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy ? `${copy.title}: ${name}` : 'Update offer'}</DialogTitle>
          <DialogDescription>
            {copy?.description ?? 'Choose what happens to this offer.'}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>{copy?.field ?? 'Note'}</FieldLabel>
          <Textarea
            id={id}
            rows={3}
            maxLength={1000}
            value={text}
            onChange={(event) => setText(event.target.value)}
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={act.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={copy?.destructive ? 'destructive' : 'default'}
            className={copy?.destructive ? 'bg-danger text-white hover:bg-danger/90' : undefined}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {act.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {copy?.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
