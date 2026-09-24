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

export interface StatusNoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The move being confirmed, e.g. { key: 'on_hold', label: 'Put on hold' }. */
  target: { key: string; label: string } | null
  jobTitle: string
  onConfirm: (note: string) => Promise<void>
}

const HINTS: Record<string, string> = {
  on_hold: 'Why is hiring paused? The note appears in the activity feed.',
  closed: 'Why is the role closing? The note appears in the activity feed.',
  open: 'Optional note for the activity feed.',
}

/** Status moves that deserve a reason (on hold, closed) collect one here (plan.md 6.10 status). */
export function StatusNoteDialog({
  open,
  onOpenChange,
  target,
  jobTitle,
  onConfirm,
}: StatusNoteDialogProps) {
  const id = useId()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) return
    const handle = window.setTimeout(() => {
      setNote('')
      setBusy(false)
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open])

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      await onConfirm(note.trim())
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
          <DialogTitle>
            {target?.label ?? 'Change status'}: {jobTitle}
          </DialogTitle>
          <DialogDescription>
            {HINTS[target?.key ?? ''] ?? 'Optional note for the activity feed.'}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>Note</FieldLabel>
          <Textarea
            id={id}
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Budget review until next quarter"
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={busy}>
            {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {target?.label ?? 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
