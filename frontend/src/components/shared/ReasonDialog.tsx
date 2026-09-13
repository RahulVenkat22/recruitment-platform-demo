import { Loader2Icon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
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

export interface ReasonDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Label of the confirm button. */
  confirmLabel: string
  fieldLabel?: string
  placeholder?: string
  required?: boolean
  destructive?: boolean
  onConfirm: (text: string) => Promise<void>
}

/** A one-field confirm: collect a note or reason, then run the action (cancel an interview, drop a step). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  fieldLabel = 'Reason',
  placeholder,
  required = false,
  destructive = false,
  onConfirm,
}: ReasonDialogProps) {
  const id = useId()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) return
    const handle = window.setTimeout(() => {
      setText('')
      setBusy(false)
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open])

  async function confirm() {
    if (busy || (required && !text.trim())) return
    setBusy(true)
    try {
      await onConfirm(text.trim())
      onOpenChange(false)
    } catch {
      // Reported by the caller.
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>
            {fieldLabel}
            {required ? ' *' : ' (optional)'}
          </FieldLabel>
          <Textarea
            id={id}
            rows={3}
            maxLength={500}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            className={destructive ? 'bg-danger text-white hover:bg-danger/90' : undefined}
            disabled={busy || (required && !text.trim())}
            onClick={() => void confirm()}
          >
            {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
