import { Loader2Icon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
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

/**
 * plan.md 8.4 TransitionDialog: choose (or confirm) the next status and add the
 * note or reason the plan.md 6.5 rules require. The allowed moves come from the
 * API so the menu can never offer an illegal move.
 */
export function TransitionDialog({
  application,
  initialStatus,
  onOpenChange,
}: TransitionDialogProps) {
  const open = application !== null
  const ids = { status: useId(), note: useId() }
  const moves = useMoves(application?.id, open)
  const transition = useTransition()
  const [status, setStatus] = useState(initialStatus ?? '')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => {
      setStatus(initialStatus ?? '')
      setNote('')
    }, 0)
    return () => window.clearTimeout(handle)
  }, [open, initialStatus, application?.id])

  const groups = useMemo(() => groupMoves(moves.data ?? []), [moves.data])
  const move = moves.data?.find((entry) => entry.status === status) ?? null
  const needsText = move?.requires === 'note' || move?.requires === 'reason'
  const canSubmit = Boolean(move) && (!needsText || note.trim().length > 0) && !transition.isPending
  const candidateName = application?.candidate.full_name ?? ''

  async function submit() {
    if (!application || !move) return
    try {
      const result = await transition.mutateAsync({
        id: application.id,
        status: move.status,
        note: move.requires === 'reason' ? '' : note,
        reason: move.requires === 'reason' ? note : '',
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
          <DialogTitle>
            {initialStatus
              ? `${statusMeta(initialStatus).label}: ${candidateName}`
              : `Change status for ${candidateName}`}
          </DialogTitle>
          <DialogDescription>
            {application ? `Currently ${statusMeta(application.status).label}.` : ''} Every move is
            written to the timeline and the owner is notified.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={ids.status}>New status</FieldLabel>
          <Select value={status} onValueChange={setStatus} disabled={moves.isPending}>
            <SelectTrigger id={ids.status} className="w-full">
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
          {moves.isError && (
            <FieldDescription className="text-danger">
              {describeError(moves.error)}
            </FieldDescription>
          )}
          {moves.isSuccess && moves.data.length === 0 && (
            <FieldDescription>No status change is possible from here.</FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.note}>
            {move?.requires === 'reason' ? 'Reason' : 'Note'}
            {needsText ? ' *' : ' (optional)'}
          </FieldLabel>
          <Textarea
            id={ids.note}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              move?.requires === 'reason'
                ? 'Why this decision? Shown on the timeline.'
                : 'What happened? Shown on the timeline.'
            }
          />
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
            variant={move?.kind === 'decision' ? 'destructive' : 'default'}
            className={
              move?.kind === 'decision' ? 'bg-danger text-white hover:bg-danger/90' : undefined
            }
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            {transition.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {move ? `Move to ${move.label}` : 'Move'}
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
