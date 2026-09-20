import {
  ArrowRightLeftIcon,
  CalendarPlusIcon,
  FileSignatureIcon,
  ListChecksIcon,
  MailIcon,
  PhoneCallIcon,
  RocketIcon,
  UserRoundIcon,
  XCircleIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { RowAction } from '@/components/shared/ActionMenu'
import { ReasonDialog } from '@/components/shared/ReasonDialog'
import { useTransition } from '@/features/applications/api'
import { candidateHref, SHORTLISTABLE } from '@/features/applications/application-utils'
import {
  atLeast,
  isActive,
  toTarget,
  type PipelineTarget,
} from '@/features/applications/pipeline-target'
import { BulkTransitionDialog, TransitionDialog } from '@/features/applications/TransitionDialog'
import {
  BulkEmailDialog,
  EmailCandidateDialog,
} from '@/features/communications/EmailCandidateDialog'
import { LogContactDialog } from '@/features/communications/LogContactDialog'
import { useCancelInterview, useDeleteInterview } from '@/features/interviews/api'
import { FeedbackDialog } from '@/features/interviews/FeedbackDialog'
import { ScheduleInterviewDialog } from '@/features/interviews/ScheduleInterviewDialog'
import type { OfferAction } from '@/features/offers/api'
import { OfferActionDialog } from '@/features/offers/OfferActionDialog'
import { OfferDialog } from '@/features/offers/OfferDialog'
import { StartOnboardingDialog } from '@/features/onboarding/StartOnboardingDialog'
import { describeError } from '@/lib/errors'
import { statusMeta } from '@/lib/enums'
import type { ApplicationRow, Interview, Offer } from '@/types/domain'

const CLOSED = new Set(['rejected', 'withdrawn', 'onboarded'])

export interface ApplicationActionsHandle {
  itemsFor: (row: ApplicationRow) => RowAction[]
  shortlist: (row: ApplicationRow) => Promise<void>
  /**
   * Moves straight to `status` with the given reason; toasts the outcome. Only
   * for callers that collected the reason themselves; the UI paths use `changeStatus`.
   */
  transitionTo: (row: ApplicationRow, status: string, reason: string) => Promise<void>
  /** Opens the status dialog with every allowed move, or with `status` preselected. */
  changeStatus: (row: ApplicationRow, status?: string) => void
  /** Opens the status dialog with "Rejected" preselected. */
  reject: (row: ApplicationRow) => void
  logContact: (row: PipelineTarget) => void
  emailCandidate: (row: PipelineTarget) => void
  scheduleInterview: (row: PipelineTarget) => void
  rescheduleInterview: (interview: Interview) => void
  cancelInterview: (interview: Interview) => void
  deleteInterview: (interview: Interview) => Promise<void>
  submitFeedback: (interview: Interview) => void
  makeOffer: (row: PipelineTarget) => void
  editOffer: (offer: Offer) => void
  offerAction: (offer: Offer, action: Exclude<OfferAction, 'send'>) => void
  startOnboarding: (row: PipelineTarget, defaultStartDate?: string | null) => void
  bulkShortlist: (rows: ApplicationRow[]) => void
  bulkReject: (rows: ApplicationRow[]) => void
  bulkEmail: (rows: ApplicationRow[]) => void
  dialogs: ReactNode
}

/**
 * Row, header and bulk actions for candidates in a pipeline (plan.md 9.8, 9.10,
 * 9.11): open profile, shortlist, log contact, schedule interview, change
 * status, reject; plus the interview, offer and onboarding dialogs. Render
 * `dialogs` once per page.
 */
export function useApplicationActions(callbacks: { onBulkDone?: () => void } = {}) {
  const transition = useTransition()
  const cancel = useCancelInterview()
  const remove = useDeleteInterview()
  const [dialog, setDialog] = useState<{ row: ApplicationRow; status?: string } | null>(null)
  const [bulk, setBulk] = useState<{
    rows: ApplicationRow[]
    status: string
    label: string
    requireNote: boolean
  } | null>(null)
  const [contact, setContact] = useState<PipelineTarget | null>(null)
  const [email, setEmail] = useState<PipelineTarget | null>(null)
  const [bulkMail, setBulkMail] = useState<ApplicationRow[] | null>(null)
  const [schedule, setSchedule] = useState<PipelineTarget | null>(null)
  const [reschedule, setReschedule] = useState<Interview | null>(null)
  const [cancelling, setCancelling] = useState<Interview | null>(null)
  const [feedback, setFeedback] = useState<Interview | null>(null)
  const [offer, setOffer] = useState<{ row?: PipelineTarget; offer?: Offer } | null>(null)
  const [offerAct, setOfferAct] = useState<{
    offer: Offer
    action: Exclude<OfferAction, 'send'>
  } | null>(null)
  const [onboarding, setOnboarding] = useState<{
    row: PipelineTarget
    start?: string | null
  } | null>(null)

  async function transitionTo(row: ApplicationRow, status: string, reason: string) {
    try {
      const result = await transition.mutateAsync({ id: row.id, status, reason })
      toast.success(
        `Moved ${row.candidate.full_name} to ${statusMeta(result.application.status).label}`,
      )
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  /** Shortlisting is a status change like any other: confirmed with a reason (Enhancement.md 6). */
  async function shortlist(row: ApplicationRow) {
    setDialog({ row, status: 'hr_review' })
  }

  async function deleteInterview(interview: Interview) {
    try {
      await remove.mutateAsync(interview.id)
      toast.success('Interview removed')
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  function itemsFor(row: ApplicationRow): RowAction[] {
    const items: RowAction[] = [
      { key: 'profile', label: 'Open profile', icon: UserRoundIcon, href: candidateHref(row) },
    ]
    if (!row.permissions.can_transition) return items
    const active = isActive(row.status)
    if (SHORTLISTABLE.has(row.status)) {
      items.push({
        key: 'shortlist',
        label: 'Shortlist',
        icon: ListChecksIcon,
        onSelect: () => void shortlist(row),
      })
    }
    if (active) {
      items.push({
        key: 'contact',
        label: 'Log contact…',
        icon: PhoneCallIcon,
        onSelect: () => setContact(toTarget(row)),
      })
      items.push({
        key: 'email',
        label: 'Email candidate…',
        icon: MailIcon,
        onSelect: () => setEmail(toTarget(row)),
      })
      items.push({
        key: 'interview',
        label: 'Schedule interview…',
        icon: CalendarPlusIcon,
        onSelect: () => setSchedule(toTarget(row)),
      })
      if (row.permissions.can_manage && atLeast(row.status, 'selected')) {
        if (!atLeast(row.status, 'offer_sent')) {
          items.push({
            key: 'offer',
            label: 'Make an offer…',
            icon: FileSignatureIcon,
            onSelect: () => setOffer({ row: toTarget(row) }),
          })
        }
        if (row.status === 'offer_accepted') {
          items.push({
            key: 'onboarding',
            label: 'Start onboarding…',
            icon: RocketIcon,
            onSelect: () => setOnboarding({ row: toTarget(row) }),
          })
        }
      }
    }
    if (!CLOSED.has(row.status) || row.status === 'rejected' || row.status === 'withdrawn') {
      items.push({
        key: 'status',
        label: 'Change status…',
        icon: ArrowRightLeftIcon,
        separatorBefore: true,
        onSelect: () => setDialog({ row }),
      })
    }
    if (!CLOSED.has(row.status)) {
      items.push({
        key: 'reject',
        label: 'Reject…',
        icon: XCircleIcon,
        destructive: true,
        onSelect: () => setDialog({ row, status: 'rejected' }),
      })
    }
    return items
  }

  const dialogs = (
    <>
      <TransitionDialog
        application={dialog?.row ?? null}
        initialStatus={dialog?.status}
        onOpenChange={(open) => !open && setDialog(null)}
      />
      <BulkTransitionDialog
        rows={bulk?.rows ?? null}
        status={bulk?.status ?? 'hr_review'}
        label={bulk?.label ?? 'Move'}
        requireNote={bulk?.requireNote ?? false}
        onOpenChange={(open) => !open && setBulk(null)}
        onDone={callbacks.onBulkDone}
      />
      <LogContactDialog application={contact} onOpenChange={(open) => !open && setContact(null)} />
      <EmailCandidateDialog application={email} onOpenChange={(open) => !open && setEmail(null)} />
      <BulkEmailDialog
        rows={bulkMail}
        onOpenChange={(open) => !open && setBulkMail(null)}
        onDone={callbacks.onBulkDone}
      />
      <ScheduleInterviewDialog
        application={schedule}
        interview={reschedule}
        onOpenChange={(open) => {
          if (open) return
          setSchedule(null)
          setReschedule(null)
        }}
      />
      <FeedbackDialog interview={feedback} onOpenChange={(open) => !open && setFeedback(null)} />
      <ReasonDialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
        title={
          cancelling
            ? `Cancel ${cancelling.round_label.toLowerCase()} interview: ${cancelling.application.candidate.full_name}`
            : 'Cancel interview'
        }
        description="The interviewer and the owner are notified; the candidate keeps their current status."
        confirmLabel="Cancel interview"
        destructive
        placeholder="Interviewer unavailable; will rebook next week."
        onConfirm={async (reason) => {
          if (!cancelling) return
          try {
            await cancel.mutateAsync({ id: cancelling.id, reason })
            toast.success('Interview cancelled')
          } catch (error) {
            toast.error(describeError(error))
            throw error
          }
        }}
      />
      <OfferDialog
        application={offer?.row ?? null}
        offer={offer?.offer ?? null}
        onOpenChange={(open) => !open && setOffer(null)}
      />
      <OfferActionDialog
        offer={offerAct?.offer ?? null}
        action={offerAct?.action ?? null}
        onOpenChange={(open) => !open && setOfferAct(null)}
      />
      <StartOnboardingDialog
        application={onboarding?.row ?? null}
        defaultStartDate={onboarding?.start}
        onOpenChange={(open) => !open && setOnboarding(null)}
      />
    </>
  )

  return {
    itemsFor,
    shortlist,
    transitionTo,
    changeStatus: (row: ApplicationRow, status?: string) => setDialog({ row, status }),
    reject: (row: ApplicationRow) => setDialog({ row, status: 'rejected' }),
    logContact: (row: PipelineTarget) => setContact(row),
    emailCandidate: (row: PipelineTarget) => setEmail(row),
    scheduleInterview: (row: PipelineTarget) => setSchedule(row),
    rescheduleInterview: (interview: Interview) => setReschedule(interview),
    cancelInterview: (interview: Interview) => setCancelling(interview),
    deleteInterview,
    submitFeedback: (interview: Interview) => setFeedback(interview),
    makeOffer: (row: PipelineTarget) => setOffer({ row }),
    editOffer: (existing: Offer) => setOffer({ offer: existing }),
    offerAction: (existing: Offer, action: Exclude<OfferAction, 'send'>) =>
      setOfferAct({ offer: existing, action }),
    startOnboarding: (row: PipelineTarget, defaultStartDate?: string | null) =>
      setOnboarding({ row, start: defaultStartDate }),
    bulkShortlist: (rows: ApplicationRow[]) =>
      setBulk({ rows, status: 'hr_review', label: 'Shortlist', requireNote: false }),
    bulkReject: (rows: ApplicationRow[]) =>
      setBulk({ rows, status: 'rejected', label: 'Reject', requireNote: true }),
    bulkEmail: (rows: ApplicationRow[]) => setBulkMail(rows),
    dialogs,
  } satisfies ApplicationActionsHandle
}
