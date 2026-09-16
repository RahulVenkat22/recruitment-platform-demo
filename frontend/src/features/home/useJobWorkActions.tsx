import { MessageSquarePlusIcon, XCircleIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { RowAction } from '@/components/shared/ActionMenu'
import { ReasonDialog } from '@/components/shared/ReasonDialog'
import { useAddJobComment, useForceCloseJob } from '@/features/jobs/api'
import { isHighLevelUser, permissionsOf } from '@/features/jobs/job-permissions'
import { FORCE_CLOSABLE } from '@/features/jobs/job-utils'
import { useAuthStore } from '@/lib/auth-store'
import { describeError } from '@/lib/errors'
import type { JobDetail, JobRow } from '@/types/domain'

export type WorkableJob = JobRow | JobDetail

export interface JobWorkActionsHandle {
  /** The "⋮" items for one JD; empty for low-level users, who never see the menu. */
  itemsFor: (job: WorkableJob) => RowAction[]
  /** Render once per page; hosts the comment and force-close dialogs. */
  dialogs: ReactNode
}

/**
 * The homepage row actions of Enhancement.md 3: "Add Comment" writes a
 * `jd.comment_added` event to the JD timeline, "Force Close" ends the
 * recruitment after a confirmation. Both are limited to high-level users (HR
 * admins and HR); the server enforces the same rules.
 */
export function useJobWorkActions(): JobWorkActionsHandle {
  const user = useAuthStore((state) => state.user)
  const comment = useAddJobComment()
  const forceClose = useForceCloseJob()
  const [commenting, setCommenting] = useState<WorkableJob | null>(null)
  const [closing, setClosing] = useState<WorkableJob | null>(null)

  function itemsFor(job: WorkableJob): RowAction[] {
    if (!isHighLevelUser(user)) return []
    const permissions = permissionsOf(user, job)
    return [
      {
        key: 'comment',
        label: 'Add comment…',
        icon: MessageSquarePlusIcon,
        disabled: !permissions.can_comment,
        onSelect: () => setCommenting(job),
      },
      {
        key: 'force-close',
        label: 'Force close…',
        icon: XCircleIcon,
        destructive: true,
        separatorBefore: true,
        disabled: !permissions.can_force_close || !FORCE_CLOSABLE.has(job.status),
        onSelect: () => setClosing(job),
      },
    ]
  }

  const dialogs = (
    <>
      <ReasonDialog
        open={commenting !== null}
        onOpenChange={(open) => !open && setCommenting(null)}
        title={commenting ? `Add a comment to “${commenting.title}”` : 'Add a comment'}
        description="The comment is added to the job description's timeline, where everyone involved can read it."
        fieldLabel="Comment"
        placeholder="Waiting on the hiring manager to confirm the interview panel."
        confirmLabel="Add comment"
        required
        onConfirm={async (text) => {
          if (!commenting) return
          try {
            await comment.mutateAsync({ id: commenting.id, text })
            toast.success(`Comment added to “${commenting.title}”`)
          } catch (error) {
            toast.error(describeError(error))
            throw error
          }
        }}
      />
      <ReasonDialog
        open={closing !== null}
        onOpenChange={(open) => !open && setClosing(null)}
        title={closing ? `Force close “${closing.title}”?` : 'Force close'}
        description="This ends the recruitment now: the job description becomes Force Closed, searches stop and candidates keep their current status. An HR admin can reopen it later."
        fieldLabel="Reason"
        placeholder="Role withdrawn by the business."
        confirmLabel="Force close"
        destructive
        onConfirm={async (reason) => {
          if (!closing) return
          try {
            await forceClose.mutateAsync({ id: closing.id, reason })
            toast.success(`“${closing.title}” is now force closed`)
          } catch (error) {
            toast.error(describeError(error))
            throw error
          }
        }}
      />
    </>
  )

  return { itemsFor, dialogs }
}
