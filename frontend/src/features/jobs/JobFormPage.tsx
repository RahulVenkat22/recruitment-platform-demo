import { LockIcon } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { SkeletonCard, SkeletonText } from '@/components/shared/Skeletons'
import { Button } from '@/components/ui/button'
import { useCreateJob, useJob, useUpdateJob } from '@/features/jobs/api'
import {
  emptyJobForm,
  formToCreatePayload,
  formToUpdatePayload,
  jobToForm,
  type JobFormValues,
} from '@/features/jobs/job-form-schema'
import { canCreateJob } from '@/features/jobs/job-permissions'
import type { SubmitIntent } from '@/features/jobs/JobForm'
import { useJobUploadStore } from '@/features/jobs/job-upload-store'
import { useAuthStore } from '@/lib/auth-store'
import type { Crumb } from '@/lib/ui-store'
import { personFromUser } from '@/types/domain'

const LIST_CRUMB: Crumb = { label: 'Job Descriptions', to: '/jobs' }

/** What the Job Descriptions page's upload panel hands over after reading a file. */
interface FilledState {
  prefill?: Partial<JobFormValues>
  filledFrom?: string
  uploadId?: string
}

// The form pulls in the schema, pickers and dialogs; keep it out of the list and detail chunks.
const JobForm = lazy(() => import('@/features/jobs/JobForm'))

function PageSkeleton({ title, crumbs }: { title: string; crumbs: Crumb[] }) {
  return (
    <>
      <PageHeader title={title} breadcrumbs={crumbs} />
      <FormSkeleton />
    </>
  )
}

function FormSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,880px)]">
      <SkeletonCard lines={4} />
      <div className="space-y-5">
        <SkeletonCard lines={5} />
        <SkeletonCard lines={3} />
        <SkeletonText lines={4} />
      </div>
    </div>
  )
}

/** plan.md 9.5: `/jobs/new` and `/jobs/:id/edit`. */
export default function JobFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const job = useJob(mode === 'edit' ? id : undefined)
  const create = useCreateJob()
  const update = useUpdateJob(id ?? '')
  const title = mode === 'create' ? 'New Job Description' : 'Edit Job Description'

  if (mode === 'create') {
    if (!canCreateJob(user)) {
      return (
        <>
          <PageHeader title={title} breadcrumbs={[LIST_CRUMB, { label: title }]} />
          <EmptyState
            icon={LockIcon}
            title="You can't create job descriptions"
            description="Only HR admins and HR team members can create a job description. Ask your HR admin if you need one raised."
            action={
              <Button asChild variant="outline">
                <Link to="/jobs">Back to job descriptions</Link>
              </Button>
            }
          />
        </>
      )
    }

    async function onCreate(values: JobFormValues, intent: SubmitIntent) {
      const created = await create.mutateAsync(
        formToCreatePayload(values, intent === 'draft' ? 'draft' : 'open'),
      )
      toast.success(
        intent === 'draft' ? `Saved “${created.title}” as a draft` : `Created “${created.title}”`,
      )
      const uploadId = (location.state as FilledState | null)?.uploadId
      if (uploadId) void useJobUploadStore.getState().dismiss(uploadId)
      // Replace the form in the history so Back from the new JD returns to the list, not the form.
      navigate(`/jobs/${created.id}`, { replace: true })
    }

    const filled = (location.state as FilledState | null) ?? {}
    return (
      <Suspense fallback={<PageSkeleton title={title} crumbs={[LIST_CRUMB, { label: title }]} />}>
        <JobForm
          mode="create"
          title={title}
          breadcrumbs={[LIST_CRUMB, { label: title }]}
          initialValues={emptyJobForm(user)}
          prefill={filled.prefill}
          filledFrom={filled.filledFrom}
          creator={user ? personFromUser(user) : null}
          cancelTo="/jobs"
          onSubmit={onCreate}
        />
      </Suspense>
    )
  }

  const crumbs: Crumb[] = [
    LIST_CRUMB,
    ...(job.data ? [{ label: job.data.title, to: `/jobs/${job.data.id}` }] : []),
    { label: title },
  ]

  if (job.isPending) {
    return <PageSkeleton title={title} crumbs={crumbs} />
  }

  if (job.isError) {
    return (
      <>
        <PageHeader title={title} breadcrumbs={crumbs} />
        <ErrorState
          title="Couldn't load this job description"
          error={job.error}
          onRetry={() => void job.refetch()}
        />
      </>
    )
  }

  const detail = job.data
  if (!detail.permissions.can_edit || detail.status === 'archived') {
    return (
      <>
        <PageHeader title={title} breadcrumbs={crumbs} />
        <EmptyState
          icon={LockIcon}
          title={
            detail.status === 'archived'
              ? 'This job description is archived'
              : "You can't edit this job description"
          }
          description={
            detail.status === 'archived'
              ? 'Unarchive it from the job description page to make changes.'
              : 'Only the creator, an owner-role participant or an HR admin can edit it.'
          }
          action={
            <Button asChild variant="outline">
              <Link to={`/jobs/${detail.id}`}>Open job description</Link>
            </Button>
          }
        />
      </>
    )
  }

  async function onUpdate(values: JobFormValues, _intent: SubmitIntent, changeSummary: string) {
    const updated = await update.mutateAsync(formToUpdatePayload(values, changeSummary))
    toast.success(
      updated.current_version > detail.current_version
        ? `Saved as version ${updated.current_version}`
        : 'Changes saved',
    )
    navigate(`/jobs/${updated.id}`, { replace: true })
  }

  return (
    <Suspense fallback={<PageSkeleton title={title} crumbs={crumbs} />}>
      <JobForm
        key={detail.id}
        mode="edit"
        job={detail}
        title={title}
        breadcrumbs={crumbs}
        initialValues={jobToForm(detail)}
        creator={personFromUser(detail.created_by)}
        cancelTo={`/jobs/${detail.id}`}
        onSubmit={onUpdate}
      />
    </Suspense>
  )
}
