import { Loader2Icon } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Danger-coloured confirm button for deletes and other one-way actions. */
  destructive?: boolean
  /** The exact text the user must type before the confirm button enables (e.g. the JD title). */
  requireTyping?: string
  /** May return a promise; the dialog shows a spinner until it settles and closes on success. */
  onConfirm: () => void | Promise<unknown>
}

/** Radix dialog for confirmations (plan.md 8.4): optional "type the title" guard for destructive actions. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  requireTyping,
  onConfirm,
}: ConfirmDialogProps) {
  const inputId = useId()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) return
    // Reset after the dialog closes so a reopened dialog starts clean.
    const handle = window.setTimeout(() => {
      setTyped('')
      setBusy(false)
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open])

  const guarded = typeof requireTyping === 'string' && requireTyping.length > 0
  const matches = !guarded || typed.trim() === requireTyping.trim()

  async function confirm() {
    if (!matches || busy) return
    setBusy(true)
    try {
      await onConfirm()
      setBusy(false)
      onOpenChange(false)
    } catch {
      // The caller reports the failure (toast, field error); the dialog stays open to retry.
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
        {guarded && (
          <div className="space-y-2">
            <Label htmlFor={inputId} className="text-small text-ink-muted">
              Type <span className="font-medium text-ink">{requireTyping}</span> to confirm
            </Label>
            <Input
              id={inputId}
              autoComplete="off"
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void confirm()
                }
              }}
            />
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            data-destructive={destructive ? 'true' : undefined}
            aria-busy={busy || undefined}
            disabled={!matches || busy}
            onClick={() => void confirm()}
            className={cn(destructive && 'bg-danger text-white hover:bg-danger/90')}
          >
            {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
