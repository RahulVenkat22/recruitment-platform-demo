import { ArrowRightIcon, Loader2Icon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/shared/StatusBadge'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useBulkTransition, useMoves, useTransition } from '@/features/applications/api'
import { describeError } from '@/lib/errors'
import { statusMeta } from '@/lib/enums'
import type { ApplicationRow, Move } from '@/types/domain'

const KIND_LABELS: Record<string, string> = {
  forward: 'Forward',
  back: 'Back',
  reset: 'Reset',
  decision: 'Decisions',
  resume: 'Resume',
  reopen: 'Reopen',
}
const KIND_ORDER = ['forward', 'back', 'reset', 'resume', 'reopen', 'decision']

function groupMoves(moves: Move[]): { kind: string; label: string; moves: Move[] }[] {
  const byKind = new Map<string, Move[]>()
  for (const move of moves) byKind.set(move.kind, [...(byKind.get(move.kind) ?? []), move])
  return KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    label: KIND_LABELS[kind] ?? kind,
    moves: byKind.get(kind) ?? [],
  }))
}

export interface TransitionDialogProps {
  /** The application to move; `null` keeps the dialog closed. */
  application: ApplicationRow | null
  /** Preselects a target (e.g. "rejected"); otherwise the user picks from the allowed moves. */
  initialStatus?: string
  onOpenChange: (open: boolean) => void
}

export const REASON_REQUIRED_MESSAGE = 'Give a reason before confirming the change.'
export const STATUS_REQUIRED_MESSAGE = 'Choose the new status.'

/**
 * Enhancement.md 6: every candidate status change is confirmed here. The dialog
 * shows the current and the new status side by side, requires a reason, and only
 * then submits the move; the reason lands on the timeline with the From → To.
 * The allowed moves come from the API so the list can never offer an illegal move.
 */
export function TransitionDialog({
  application,
  initialStatus,
  onOpenChange,
}: TransitionDialogProps) {
  const open = application !== null
  const ids = { status: useId(), reason: useId() }
  const moves = useMoves(application?.id, open)
  const transition = useTransition()
  const [status, setStatus] = useState(initialStatus ?? '')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      setStatus(initialStatus ?? '')
      setReason('')
      setReasonError(null)
      setStatusError(null)
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open, initialStatus, application?.id])

  const groups = useMemo(() => groupMoves(moves.data ?? []), [moves.data])
  const move = moves.data?.find((entry) => entry.status === status) ?? null
  const candidateName = application?.candidate.full_name ?? ''
  const jobTitle = application?.job?.title ?? ''
  const decision = move?.kind === 'decision'

  async function submit() {
    if (!application || transition.isPending) return
    if (!move) {
      setStatusError(STATUS_REQUIRED_MESSAGE)
      return
    }
    const text = reason.trim()
    if (!text) {
      setReasonError(REASON_REQUIRED_MESSAGE)
      return
    }
    try {
      const result = await transition.mutateAsync({
        id: application.id,
        status: move.status,
        reason: text,
        note: move.requires === 'note' ? text : '',
      })
      toast.success(`Moved ${candidateName} to ${statusMeta(result.application.status).label}`)
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !transition.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change candidate status</DialogTitle>
          <DialogDescription>
            {candidateName}
            {jobTitle ? ` · ${jobTitle}` : ''}. The change and your reason are written to the
            timeline and the owner is notified.
          </DialogDescription>
        </DialogHeader>

        {application && (
          <div
            data-slot="status-change-summary"
            className="grid gap-3 rounded-card border border-line bg-surface-2/70 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center"
          >
            <div className="min-w-0">
              <span className="mb-1 block text-caption font-medium tracking-[0.06em] text-ink-subtle uppercase">
                Current status
              </span>
              <StatusBadge status={application.status} size="md" dot />
            </div>
            <ArrowRightIcon
              aria-hidden="true"
              className="size-4 justify-self-center text-ink-subtle max-sm:rotate-90"
            />
            <div className="min-w-0">
              <span className="mb-1 block text-caption font-medium tracking-[0.06em] text-ink-subtle uppercase">
                New status
              </span>
              {move ? (
                <StatusBadge status={move.status} size="md" dot />
              ) : (
                <span className="text-small text-ink-subtle">Choose below</span>
              )}
            </div>
          </div>
        )}

        <Field data-invalid={Boolean(statusError)}>
          <FieldLabel htmlFor={ids.status}>New status *</FieldLabel>
          <Select
            value={status}
            onValueChange={(next) => {
              setStatus(next)
              setStatusError(null)
            }}
            disabled={moves.isPending}
          >
            <SelectTrigger
              id={ids.status}
              className="w-full"
              aria-invalid={Boolean(statusError) || undefined}
            >
              <SelectValue placeholder={moves.isPending ? 'Loading moves…' : 'Choose a status'} />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectGroup key={group.kind}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.moves.map((entry) => (
                    <SelectItem key={entry.status} value={entry.status}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {statusError && <FieldError errors={[{ message: statusError }]} />}
          {moves.isError && (
            <FieldDescription className="text-danger">
              {describeError(moves.error)}
            </FieldDescription>
          )}
          {moves.isSuccess && moves.data.length === 0 && (
            <FieldDescription>No status change is possible from here.</FieldDescription>
          )}
        </Field>

        <Field data-invalid={Boolean(reasonError)}>
          <FieldLabel htmlFor={ids.reason}>Reason *</FieldLabel>
          <Textarea
            id={ids.reason}
            rows={3}
            maxLength={1000}
            required
            aria-invalid={Boolean(reasonError) || undefined}
            aria-describedby={reasonError ? undefined : `${ids.reason}-hint`}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              if (reasonError && event.target.value.trim()) setReasonError(null)
            }}
            placeholder={
              decision
                ? 'Why this decision? For example: not enough hands-on experience with Django.'
                : 'Why this change? For example: candidate performed well in the technical interview.'
            }
          />
          {reasonError ? (
            <FieldError errors={[{ message: reasonError }]} />
          ) : (
            <FieldDescription id={`${ids.reason}-hint`}>
              Required. Shown on the candidate's timeline next to the status change.
            </FieldDescription>
          )}
        </Field>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={transition.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={decision ? 'destructive' : 'default'}
            className={decision ? 'bg-danger text-white hover:bg-danger/90' : undefined}
            disabled={transition.isPending || moves.isPending}
            aria-busy={transition.isPending || undefined}
            onClick={() => void submit()}
          >
            {transition.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Confirm change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface BulkTransitionDialogProps {
  rows: ApplicationRow[] | null
  status: string
  label: string
  /** Text is required for decisions (reject / hold / withdraw) and backward moves. */
  requireNote?: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}

/** Moves several applications at once with one note; one grouped timeline activity per JD. */
export function BulkTransitionDialog({
  rows,
  status,
  label,
  requireNote = false,
  onOpenChange,
  onDone,
}: BulkTransitionDialogProps) {
  const open = rows !== null && rows.length > 0
  const id = useId()
  const bulk = useBulkTransition()
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) return
    const handle = window.setTimeout(() => setNote(''), 0)
    return () => window.clearTimeout(handle)
  }, [open])

  async function submit() {
    if (!rows) return
    try {
      const result = await bulk.mutateAsync({ ids: rows.map((row) => row.id), status, note })
      const skipped = Object.keys(result.skipped).length
      toast.success(
        `${label}: ${result.moved.length} ${result.moved.length === 1 ? 'candidate' : 'candidates'}` +
          (skipped ? ` (${skipped} skipped)` : ''),
      )
      onDone?.()
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !bulk.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {label} {rows?.length ?? 0} {rows && rows.length === 1 ? 'candidate' : 'candidates'}
          </DialogTitle>
          <DialogDescription>
            {rows
              ?.slice(0, 3)
              .map((row) => row.candidate.full_name)
              .join(', ')}
            {rows && rows.length > 3 ? ` and ${rows.length - 3} more` : ''}. One grouped event is
            written to the timeline.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>{requireNote ? 'Reason *' : 'Note (optional)'}</FieldLabel>
          <Textarea
            id={id}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={bulk.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={requireNote ? 'destructive' : 'default'}
            className={requireNote ? 'bg-danger text-white hover:bg-danger/90' : undefined}
            disabled={bulk.isPending || (requireNote && !note.trim())}
            onClick={() => void submit()}
          >
            {bulk.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
