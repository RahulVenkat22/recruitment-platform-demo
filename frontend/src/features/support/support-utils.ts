import { param } from '@/lib/hooks'
import type { TicketPriority, TicketStatus } from '@/types/domain'

/** The list's filters, view and sort live in the URL like every other list (plan.md 7.1). */
export const TICKET_LIST_SPEC = {
  q: param.string(''),
  status: param.list<string>([]),
  priority: param.list<string>([]),
  category: param.list<string>([]),
  /** all = everything you may see; mine = raised by you; assigned = on your desk. */
  view: param.enum<'all' | 'mine' | 'assigned'>('all', ['all', 'mine', 'assigned']),
  sort: param.string('-last_activity_at'),
  page: param.number(1),
}

export const TICKET_LIST_CLEARED = {
  q: '',
  status: [] as string[],
  priority: [] as string[],
  category: [] as string[],
  page: 1,
}

export const TICKET_SORT_OPTIONS = [
  { key: '-last_activity_at', label: 'Latest update' },
  { key: '-created_at', label: 'Newest first' },
  { key: 'created_at', label: 'Oldest first' },
  { key: '-number', label: 'Ticket number' },
  { key: 'subject', label: 'Subject A–Z' },
] as const

export const VIEW_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'mine', label: 'Raised by me' },
  { key: 'assigned', label: 'Assigned to me' },
] as const

export const STATUS_ORDER: readonly TicketStatus[] = ['open', 'in_progress', 'resolved', 'closed']
export const PRIORITY_ORDER: readonly TicketPriority[] = ['urgent', 'high', 'medium', 'low']

export function ticketHref(id: string): string {
  return `/support/${id}`
}

/** What may travel with a ticket or a comment; mirrors backend/support/models.py. */
export const ATTACHMENT_MAX_MB = 25
export const ATTACHMENTS_MAX = 5
export const ATTACHMENT_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime'
const ATTACHMENT_TYPES = new Set(ATTACHMENT_ACCEPT.split(','))

/** Why a file cannot be attached, or null when it can. */
export function attachmentProblem(file: File): string | null {
  if (!ATTACHMENT_TYPES.has(file.type)) {
    return `${file.name}: only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV).`
  }
  if (file.size > ATTACHMENT_MAX_MB * 1024 * 1024) {
    return `${file.name} is larger than ${ATTACHMENT_MAX_MB} MB.`
  }
  return null
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  const mb = size / (1024 * 1024)
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/** What the button for a move says, given where the ticket is now. */
export function moveLabel(from: TicketStatus, to: TicketStatus): string {
  if (to === 'in_progress') return 'Start work'
  if (to === 'resolved') return 'Resolve'
  if (to === 'closed') return 'Close'
  return from === 'in_progress' ? 'Back to open' : 'Reopen'
}

/** Mirrors backend/support/permissions.py note_required. */
export function noteRequired(from: TicketStatus, to: TicketStatus): boolean {
  if (to === 'resolved') return true
  if (to === 'open') return from === 'resolved' || from === 'closed'
  if (to === 'closed') return from !== 'resolved'
  return false
}

export function moveDialogCopy(
  from: TicketStatus,
  to: TicketStatus,
): { title: string; description: string; fieldLabel: string; placeholder: string } {
  switch (to) {
    case 'resolved':
      return {
        title: 'Resolve the ticket',
        description:
          'Tell the requester what was done. They can close the ticket or reopen it if the problem is still there.',
        fieldLabel: 'Resolution',
        placeholder: 'What was changed, checked or explained…',
      }
    case 'closed':
      return from === 'resolved'
        ? {
            title: 'Close the ticket',
            description: 'Closing marks the resolution as accepted.',
            fieldLabel: 'Closing note (optional)',
            placeholder: 'Anything worth keeping with the ticket…',
          }
        : {
            title: 'Close without resolving',
            description: 'Say why the ticket is being closed as it stands.',
            fieldLabel: 'Reason',
            placeholder: 'Duplicate of SUP-1010, no longer needed, cannot reproduce…',
          }
    default:
      return {
        title: from === 'in_progress' ? 'Put the ticket back to Open' : 'Reopen the ticket',
        description:
          from === 'in_progress'
            ? 'Work has stopped; the ticket returns to the queue.'
            : 'Reopening tells the support team the problem is still there.',
        fieldLabel: from === 'in_progress' ? 'Note (optional)' : 'What is still wrong?',
        placeholder: 'The same error appears when…',
      }
  }
}
