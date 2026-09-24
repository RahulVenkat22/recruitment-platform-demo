import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CopyIcon,
  EyeIcon,
  HistoryIcon,
  PencilIcon,
  Trash2Icon,
  UserSearchIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { RowAction } from '@/components/shared/ActionMenu'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { describeError } from '@/lib/errors'
import { useDeleteJob, useJobAction } from '@/features/jobs/api'
import { permissionsOf } from '@/features/jobs/job-permissions'
import { useAuthStore } from '@/lib/auth-store'
import type { JobDetail, JobRow } from '@/types/domain'

export type ActionableJob = JobRow | JobDetail

export interface JobActionOptions {
  /** Omit "View" on the page that already shows the JD. */
  includeView?: boolean
}

export interface JobActionsHandle {
  /** Menu items for one JD, filtered by what the current user may do. */
  itemsFor: (job: ActionableJob, options?: JobActionOptions) => RowAction[]
  /** Render once near the menu; hosts the confirm dialogs. */
  dialogs: ReactNode
}

/**
 * The row / header "⋯" actions from plan.md 9.4 and 9.6: view, edit, duplicate,
 * open timeline, search candidates, archive or unarchive, delete. Mutations
 * toast on success and failure; delete asks for the title to be typed.
 */
export function useJobActions(callbacks: { onDeleted?: (job: ActionableJob) => void } = {}) {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const action = useJobAction()
  const remove = useDeleteJob()
  const [pendingDelete, setPendingDelete] = useState<ActionableJob | null>(null)
  const [pendingArchive, setPendingArchive] = useState<ActionableJob | null>(null)

  async function duplicate(job: ActionableJob) {
    try {
      const copy = await action.mutateAsync({ id: job.id, action: 'duplicate' })
      toast.success(`Duplicated as “${copy.title}”`)
      navigate(`/jobs/${copy.id}`)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  async function unarchive(job: ActionableJob) {
    try {
      const updated = await action.mutateAsync({ id: job.id, action: 'unarchive' })
      toast.success(`“${updated.title}” is ${updated.status_label.toLowerCase()} again`)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  async function archive(job: ActionableJob) {
    try {
      await action.mutateAsync({ id: job.id, action: 'archive' })
      toast.success(`Archived “${job.title}”`)
    } catch (error) {
      toast.error(describeError(error))
      throw error
    }
  }

  async function destroy(job: ActionableJob) {
    try {
      await remove.mutateAsync(job.id)
      toast.success(`Deleted “${job.title}”`)
      callbacks.onDeleted?.(job)
    } catch (error) {
      toast.error(describeError(error))
      throw error
    }
  }

  function itemsFor(job: ActionableJob, options: JobActionOptions = {}): RowAction[] {
    const permissions = permissionsOf(user, job)
    const archived = job.status === 'archived'
    const items: RowAction[] = []
    if (options.includeView !== false) {
      items.push({ key: 'view', label: 'View', icon: EyeIcon, href: `/jobs/${job.id}` })
    }
    if (permissions.can_edit && !archived) {
      items.push({ key: 'edit', label: 'Edit', icon: PencilIcon, href: `/jobs/${job.id}/edit` })
    }
    if (permissions.can_edit) {
      items.push({
        key: 'duplicate',
        label: 'Duplicate',
        icon: CopyIcon,
        onSelect: () => void duplicate(job),
      })
    }
    items.push({
      key: 'timeline',
      label: 'Open activity',
      icon: HistoryIcon,
      href: `/jobs/${job.id}?tab=timeline`,
    })
    if (permissions.can_work_pipeline && !archived) {
      items.push({
        key: 'search',
        label: 'Search candidates',
        icon: UserSearchIcon,
        href: `/search?jd=${job.id}`,
      })
    }
    if (permissions.can_edit) {
      items.push(
        archived
          ? {
              key: 'unarchive',
              label: 'Unarchive',
              icon: ArchiveRestoreIcon,
              separatorBefore: true,
              onSelect: () => void unarchive(job),
            }
          : {
              key: 'archive',
              label: 'Archive',
              icon: ArchiveIcon,
              separatorBefore: true,
              onSelect: () => setPendingArchive(job),
            },
      )
    }
    if (permissions.can_delete) {
      items.push({
        key: 'delete',
        label: 'Delete',
        icon: Trash2Icon,
        destructive: true,
        onSelect: () => setPendingDelete(job),
      })
    }
    return items
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={pendingArchive !== null}
        onOpenChange={(open) => !open && setPendingArchive(null)}
        title={pendingArchive ? `Archive “${pendingArchive.title}”?` : 'Archive job description?'}
        description="Candidates and history stay attached. The job description leaves the open list until you unarchive it."
        confirmLabel="Archive"
        onConfirm={() => (pendingArchive ? archive(pendingArchive) : undefined)}
      />
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={pendingDelete ? `Delete “${pendingDelete.title}”?` : 'Delete job description?'}
        description="This permanently removes the job description, its versions, every application on it and the whole activity feed. This cannot be undone."
        confirmLabel="Delete job description"
        destructive
        requireTyping={pendingDelete?.title}
        onConfirm={() => (pendingDelete ? destroy(pendingDelete) : undefined)}
      />
    </>
  )

  return { itemsFor, dialogs } satisfies JobActionsHandle
}
