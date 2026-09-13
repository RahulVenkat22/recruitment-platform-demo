import { FileSignatureIcon } from 'lucide-react'
import { ActionMenu, type RowAction } from '@/components/shared/ActionMenu'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { personFromUser, type Offer } from '@/types/domain'

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-surface-2 text-ink-muted',
  sent: 'bg-warning-soft text-warning',
  negotiating: 'bg-warning-soft text-warning',
  accepted: 'bg-success-soft text-success',
  declined: 'bg-danger-soft text-danger',
  withdrawn: 'bg-surface-2 text-ink-muted',
  expired: 'bg-surface-2 text-ink-muted',
}

/** The offer on an application: terms, status and the accept / decline / withdraw actions. */
export function OfferCard({ offer, actions }: { offer: Offer; actions: ApplicationActionsHandle }) {
  const manage = offer.permissions.can_manage
  const open = offer.status === 'sent' || offer.status === 'negotiating'
  const items: RowAction[] = []
  if (manage && (offer.status === 'draft' || open)) {
    items.push({ key: 'edit', label: 'Edit terms…', onSelect: () => actions.editOffer(offer) })
  }
  if (manage && open) {
    items.push({
      key: 'decline',
      label: 'Mark declined…',
      destructive: true,
      separatorBefore: true,
      onSelect: () => actions.offerAction(offer, 'decline'),
    })
  }
  if (manage && (offer.status === 'draft' || open)) {
    items.push({
      key: 'withdraw',
      label: 'Withdraw offer…',
      destructive: true,
      onSelect: () => actions.offerAction(offer, 'withdraw'),
    })
  }

  return (
    <section
      data-slot="offer-card"
      data-status={offer.status}
      className="rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-warning-soft text-warning">
          <FileSignatureIcon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-h3 text-ink">Offer</h3>
            <span
              className={cn(
                'inline-flex h-5 items-center rounded-pill px-2 text-caption font-medium',
                STATUS_CLASS[offer.status] ?? 'bg-surface-2 text-ink-muted',
              )}
            >
              {offer.status_label}
            </span>
          </div>
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-small sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-ink-subtle">Designation</dt>
              <dd className="text-ink">{offer.designation}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-subtle">Annual CTC</dt>
              <dd className="text-ink tabular-nums">{offer.annual_ctc_display}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-ink-subtle">Joining</dt>
              <dd className="text-ink">{formatDate(offer.joining_date)}</dd>
            </div>
            {offer.expires_at && (
              <div className="flex gap-2">
                <dt className="text-ink-subtle">Valid until</dt>
                <dd className="text-ink">{formatDateTime(offer.expires_at)}</dd>
              </div>
            )}
            {offer.sent_at && (
              <div className="flex gap-2">
                <dt className="text-ink-subtle">Sent</dt>
                <dd className="text-ink">{formatDateTime(offer.sent_at)}</dd>
              </div>
            )}
            {offer.responded_at && (
              <div className="flex gap-2">
                <dt className="text-ink-subtle">Responded</dt>
                <dd className="text-ink">{formatDateTime(offer.responded_at)}</dd>
              </div>
            )}
          </dl>
          {offer.notes && <p className="mt-2 text-small text-ink-muted">{offer.notes}</p>}
          {offer.created_by && (
            <div className="mt-2 flex items-center gap-1.5 text-caption text-ink-subtle">
              Prepared by <UserChip user={personFromUser(offer.created_by)} />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {manage && offer.status === 'draft' && (
            <Button size="sm" onClick={() => actions.editOffer(offer)}>
              Review and send
            </Button>
          )}
          {manage && open && (
            <Button size="sm" onClick={() => actions.offerAction(offer, 'accept')}>
              Mark accepted
            </Button>
          )}
          <ActionMenu items={items} label="Offer actions" />
        </div>
      </div>
    </section>
  )
}
