import {
  CheckIcon,
  Loader2Icon,
  PencilLineIcon,
  PlayIcon,
  RotateCcwIcon,
  SendIcon,
  UserPlusIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { ReasonDialog } from '@/components/shared/ReasonDialog'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCommentTicket, useTicket, useTransitionTicket } from '@/features/support/api'
import { AssignDialog } from '@/features/support/AssignDialog'
import { AttachmentGallery } from '@/features/support/AttachmentGallery'
import { AttachmentPicker } from '@/features/support/AttachmentPicker'
import { moveDialogCopy, moveLabel, noteRequired } from '@/features/support/support-utils'
import { TicketFormDialog } from '@/features/support/TicketFormDialog'
import { TicketTimeline } from '@/features/support/TicketTimeline'
import { describeError } from '@/lib/errors'
import { formatDateTime, formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { personFromUser, type TicketDetail, type TicketStatus } from '@/types/domain'

const MOVE_ICONS: Record<TicketStatus, LucideIcon> = {
  in_progress: PlayIcon,
  resolved: CheckIcon,
  closed: XIcon,
  open: RotateCcwIcon,
}

function Card({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'min-w-0 rounded-card border border-line bg-surface p-5 shadow-card',
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2
          id={headingId}
          className="text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase"
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="shrink-0 text-small text-ink-subtle">{label}</dt>
      <dd className="min-w-0 text-right text-small text-ink">{children}</dd>
    </div>
  )
}

function Composer({ ticket }: { ticket: TicketDetail }) {
  const id = useId()
  const [draft, setDraft] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const comment = useCommentTicket()
  const ready = draft.trim().length > 0 && !comment.isPending

  async function post() {
    if (!ready) return
    try {
      await comment.mutateAsync({ id: ticket.id, message: draft.trim(), attachments: files })
      setDraft('')
      setFiles([])
      toast.success('Comment posted')
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <form
      className="mt-5 border-t border-line pt-4"
      onSubmit={(event) => {
        event.preventDefault()
        void post()
      }}
    >
      <label htmlFor={id} className="sr-only">
        Add a comment
      </label>
      <Textarea
        id={id}
        rows={3}
        maxLength={5000}
        value={draft}
        placeholder="Add an update or ask a question… (Ctrl+Enter to post)"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void post()
        }}
      />
      <AttachmentPicker
        files={files}
        onChange={setFiles}
        disabled={comment.isPending}
        className="mt-2"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-caption text-ink-subtle">
          {ticket.assignee ? `${ticket.assignee.full_name} and ` : 'The support team and '}
          {ticket.requester.full_name} are notified.
        </span>
        <Button type="submit" size="sm" disabled={!ready}>
          {comment.isPending ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <SendIcon data-icon="inline-start" aria-hidden="true" />
          )}
          Post comment
        </Button>
      </div>
    </form>
  )
}

/**
 * One ticket: what was asked, where it stands, the answer, and every step on
 * the way. The buttons in the header are exactly the moves the server allows
 * this user; each move that needs a note (resolve, reopen, close early) asks
 * for it first.
 */
export default function TicketDetailPage() {
  const { id } = useParams()
  const query = useTicket(id)
  const transition = useTransitionTicket()
  const [editing, setEditing] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [pendingMove, setPendingMove] = useState<TicketStatus | null>(null)

  if (query.isPending) {
    return (
      <>
        <PageHeader
          title="Ticket"
          breadcrumbs={[{ label: 'Support', to: '/support' }, { label: '…' }]}
        />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={6} />
          </div>
          <SkeletonCard lines={8} />
        </div>
      </>
    )
  }
  if (query.isError) {
    return (
      <>
        <PageHeader
          title="Ticket"
          breadcrumbs={[{ label: 'Support', to: '/support' }, { label: 'Not found' }]}
        />
        <ErrorState
          title="Couldn't open this ticket"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      </>
    )
  }

  const ticket = query.data
  const moves = ticket.permissions.moves as TicketStatus[]
  const status = ticket.status as TicketStatus

  async function move(to: TicketStatus, note = '') {
    try {
      const saved = await transition.mutateAsync({ id: ticket.id, status: to, note })
      toast.success(`${saved.number} is now ${saved.status_label}`)
    } catch (error) {
      toast.error(describeError(error))
      throw error
    }
  }

  function startMove(to: TicketStatus) {
    if (to === 'in_progress') {
      void move(to).catch(() => undefined)
      return
    }
    setPendingMove(to)
  }

  const dialogCopy = pendingMove ? moveDialogCopy(status, pendingMove) : null

  return (
    <>
      <PageHeader
        title={ticket.subject}
        titleAddon={
          <span className="flex items-center gap-1.5">
            <StatusBadge status={ticket.status} kind="ticket_status" size="md" dot />
            <StatusBadge status={ticket.priority} kind="ticket_priority" size="md" />
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-small text-ink">{ticket.number}</span>
            <span>· {ticket.category_label} · raised by</span>
            <UserChip user={personFromUser(ticket.requester)} />
            <span>{formatRelative(ticket.created_at)}</span>
          </span>
        }
        breadcrumbs={[{ label: 'Support', to: '/support' }, { label: ticket.number }]}
        actions={
          <>
            {ticket.permissions.can_edit && (
              <Button type="button" variant="outline" onClick={() => setEditing(true)}>
                <PencilLineIcon data-icon="inline-start" aria-hidden="true" />
                Edit
              </Button>
            )}
            {ticket.permissions.can_assign && (
              <Button type="button" variant="outline" onClick={() => setAssigning(true)}>
                <UserPlusIcon data-icon="inline-start" aria-hidden="true" />
                {ticket.assignee ? 'Reassign' : 'Assign'}
              </Button>
            )}
            {moves.map((to, index) => {
              const Icon = MOVE_ICONS[to]
              return (
                <Button
                  key={to}
                  type="button"
                  variant={index === 0 ? 'default' : 'outline'}
                  disabled={transition.isPending}
                  onClick={() => startMove(to)}
                >
                  <Icon data-icon="inline-start" aria-hidden="true" />
                  {moveLabel(status, to)}
                </Button>
              )
            })}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Card title="What was asked">
            <p className="text-body whitespace-pre-line text-ink">{ticket.description}</p>
            <AttachmentGallery attachments={ticket.attachments} className="mt-4" />
          </Card>
          {ticket.resolution && (
            <Card title="Resolution" className="border-success/30 bg-success-soft/40">
              <p className="text-body whitespace-pre-line text-ink">{ticket.resolution}</p>
              {ticket.resolved_at && (
                <p className="mt-3 text-caption text-ink-subtle">
                  Resolved {formatDateTime(ticket.resolved_at)}
                  {ticket.status === 'resolved' &&
                    ticket.permissions.moves.includes('closed') &&
                    ' · close the ticket if this settles it, or reopen it if not.'}
                </p>
              )}
            </Card>
          )}
          <Card title="Timeline">
            <TicketTimeline events={ticket.events} />
            {ticket.permissions.can_comment ? (
              <Composer ticket={ticket} />
            ) : (
              <p className="mt-5 border-t border-line pt-4 text-caption text-ink-subtle">
                {ticket.status === 'closed'
                  ? 'This ticket is closed. Reopen it to continue the conversation.'
                  : 'Only the requester, the assignee and the support team can comment.'}
              </p>
            )}
          </Card>
        </div>
        <aside className="min-w-0">
          <Card title="Ticket">
            <dl className="divide-y divide-line">
              <Row label="Number">
                <span className="font-mono">{ticket.number}</span>
              </Row>
              <Row label="Status">
                <StatusBadge status={ticket.status} kind="ticket_status" dot />
              </Row>
              <Row label="Priority">
                <StatusBadge status={ticket.priority} kind="ticket_priority" />
              </Row>
              <Row label="Category">{ticket.category_label}</Row>
              <Row label="Raised by">
                <UserChip user={personFromUser(ticket.requester)} className="justify-end" />
              </Row>
              <Row label="Assignee">
                {ticket.assignee ? (
                  <UserChip user={personFromUser(ticket.assignee)} className="justify-end" />
                ) : (
                  <span className="text-ink-subtle">Unassigned</span>
                )}
              </Row>
              {ticket.job && (
                <Row label="Job description">
                  <Link to={`/jobs/${ticket.job.id}`} className="font-medium hover:underline">
                    {ticket.job.title}
                  </Link>
                </Row>
              )}
              <Row label="Raised">
                <span title={formatDateTime(ticket.created_at)}>
                  {formatDateTime(ticket.created_at)}
                </span>
              </Row>
              <Row label="Last update">{formatRelative(ticket.last_activity_at)}</Row>
              {ticket.resolved_at && (
                <Row label="Resolved">{formatDateTime(ticket.resolved_at)}</Row>
              )}
              {ticket.closed_at && <Row label="Closed">{formatDateTime(ticket.closed_at)}</Row>}
            </dl>
          </Card>
        </aside>
      </div>

      <TicketFormDialog open={editing} onOpenChange={setEditing} ticket={ticket} />
      <AssignDialog ticket={ticket} open={assigning} onOpenChange={setAssigning} />
      {pendingMove && dialogCopy && (
        <ReasonDialog
          open
          onOpenChange={(open) => !open && setPendingMove(null)}
          title={dialogCopy.title}
          description={dialogCopy.description}
          confirmLabel={moveLabel(status, pendingMove)}
          fieldLabel={dialogCopy.fieldLabel}
          placeholder={dialogCopy.placeholder}
          required={noteRequired(status, pendingMove)}
          destructive={pendingMove === 'closed' && status !== 'resolved'}
          onConfirm={(text) => move(pendingMove, text)}
        />
      )}
    </>
  )
}
