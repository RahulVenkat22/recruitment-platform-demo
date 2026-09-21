import type { RowSelectionState } from '@tanstack/react-table'
import { ListChecksIcon, MailIcon, PhoneOutgoingIcon, XIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { BulkActionsContext, ControlledState } from '@/components/shared/DataTable'
import { Button } from '@/components/ui/button'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import {
  ContactCandidatesButton,
  type ContactChannel,
} from '@/features/communications/ContactCandidatesButton'
import type { ApplicationRow } from '@/types/domain'

export type SelectionMode = { kind: 'contact'; channel: ContactChannel } | { kind: 'manage' } | null

/**
 * Row selection that is off until the user asks for it (Enhancement: "Contact
 * Candidates"). Choosing a channel turns the tick boxes on and makes the bulk
 * bar send the message; "Select" turns them on for shortlist / reject. The
 * dialogs' `onBulkDone` should call `stop`, which clears the selection and
 * hides the tick boxes again.
 */
export function useContactMode() {
  const [mode, setMode] = useState<SelectionMode>(null)
  const [rows, setRows] = useState<RowSelectionState>({})
  const count = Object.keys(rows).length

  function start(next: Exclude<SelectionMode, null>) {
    setMode(next)
    setRows({})
  }
  function stop() {
    setMode(null)
    setRows({})
  }

  const controls: ReactNode = (
    <>
      <Button
        type="button"
        size="sm"
        variant={mode?.kind === 'manage' ? 'secondary' : 'outline'}
        aria-pressed={mode?.kind === 'manage'}
        onClick={() => (mode?.kind === 'manage' ? stop() : start({ kind: 'manage' }))}
      >
        <ListChecksIcon data-icon="inline-start" aria-hidden="true" />
        Select
      </Button>
      <ContactCandidatesButton
        active={mode?.kind === 'contact'}
        onChoose={(channel) => start({ kind: 'contact', channel })}
      />
    </>
  )

  const banner: ReactNode = mode ? (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-2 px-3 py-2 text-small text-ink"
    >
      {mode.kind === 'contact' ? (
        mode.channel === 'phone' ? (
          <PhoneOutgoingIcon aria-hidden="true" className="size-4 text-ink-muted" />
        ) : (
          <MailIcon aria-hidden="true" className="size-4 text-ink-muted" />
        )
      ) : (
        <ListChecksIcon aria-hidden="true" className="size-4 text-ink-muted" />
      )}
      <span>
        {mode.kind === 'contact'
          ? mode.channel === 'phone'
            ? 'Tick the candidates to call, then press “Call”. The AI runs the same script for each.'
            : 'Tick the candidates to email, then press “Send email”.'
          : 'Tick candidates to shortlist or reject them together.'}{' '}
        <span className="text-ink-muted tabular-nums">{count} selected</span>
      </span>
      <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={stop}>
        <XIcon data-icon="inline-start" aria-hidden="true" />
        Cancel
      </Button>
    </div>
  ) : null

  function bulkActionsFor(actions: ApplicationActionsHandle) {
    return ({ selectedRows }: BulkActionsContext<ApplicationRow>): ReactNode =>
      mode?.kind === 'contact' ? (
        mode.channel === 'phone' ? (
          <Button type="button" size="sm" onClick={() => actions.bulkCall(selectedRows)}>
            <PhoneOutgoingIcon data-icon="inline-start" aria-hidden="true" />
            Call {selectedRows.length} {selectedRows.length === 1 ? 'candidate' : 'candidates'}
          </Button>
        ) : (
          <Button type="button" size="sm" onClick={() => actions.bulkEmail(selectedRows)}>
            <MailIcon data-icon="inline-start" aria-hidden="true" />
            Send email to {selectedRows.length}
          </Button>
        )
      ) : (
        <>
          <Button type="button" size="sm" onClick={() => actions.bulkShortlist(selectedRows)}>
            Shortlist selected
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="text-danger"
            onClick={() => actions.bulkReject(selectedRows)}
          >
            Reject selected
          </Button>
        </>
      )
  }

  const selection: ControlledState<RowSelectionState> | undefined = mode
    ? { state: rows, onChange: setRows }
    : undefined

  return { mode, selection, controls, banner, bulkActionsFor, stop }
}
