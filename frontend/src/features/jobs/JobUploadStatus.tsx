import { CheckCircle2Icon, FileTextIcon, Loader2Icon, XIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { extractionToForm } from '@/features/jobs/job-form-schema'
import { canCreateJob } from '@/features/jobs/job-permissions'
import { uploadIsActive, useJobUploadStore } from '@/features/jobs/job-upload-store'
import { useAuthStore } from '@/lib/auth-store'
import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { cn } from '@/lib/utils'

/** Mounted outside page transitions; progress and finished results follow the user. */
export function JobUploadStatus() {
  const user = useAuthStore((state) => state.user)
  const state = useJobUploadStore()
  const { activate, refresh } = state
  const location = useLocation()
  const reducedMotion = useMotionPreference()
  const active = uploadIsActive(state)
  const allowed = canCreateJob(user)
  useEffect(() => {
    activate(allowed ? (user?.id ?? null) : null)
    if (!allowed) return
    void refresh()
    if (!active) return
    const interval = window.setInterval(() => void useJobUploadStore.getState().refresh(), 1500)
    return () => window.clearInterval(interval)
  }, [allowed, user?.id, active, activate, refresh])

  const upload = state.upload
  if (!allowed || state.ownerId !== user?.id || (!upload && !state.starting && !state.error))
    return null
  const ready = upload?.status === 'ready'
  const error = state.error || upload?.error
  const reviewing = location.pathname === '/jobs/new' && location.state?.uploadId === upload?.id
  const title = state.cancelling
    ? 'Cancelling JD upload…'
    : state.starting
      ? 'Starting JD upload…'
      : state.transferring
        ? `Uploading job description · ${state.progress}%`
        : ready
          ? 'Job description ready to review'
          : upload?.status === 'failed' || (!active && error)
            ? 'JD upload needs attention'
            : upload?.status === 'uploading'
              ? 'Waiting for file transfer'
              : 'Reading job description with AI…'

  return (
    <section
      aria-label="Job description upload"
      className="relative z-20 shrink-0 border-b border-line bg-primary-soft px-6 py-3 max-md:px-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-primary">
          {active ? (
            <Loader2Icon
              aria-hidden="true"
              className={cn('size-4', !reducedMotion && 'animate-spin')}
            />
          ) : ready ? (
            <CheckCircle2Icon aria-hidden="true" className="size-5" />
          ) : (
            <FileTextIcon aria-hidden="true" className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1 basis-44">
          <p role="status" className="text-small font-semibold text-ink">
            {title}
          </p>
          <p className="truncate text-caption text-ink-muted" title={state.fileName}>
            {state.fileName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-sm:ml-12">
          {ready && !reviewing && (
            <Button asChild size="sm">
              <Link
                to="/jobs/new"
                state={{
                  prefill: extractionToForm(upload.fields),
                  filledFrom: upload.file_name,
                  uploadId: upload.id,
                }}
              >
                Review job description
              </Link>
            </Button>
          )}
          {active ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={state.cancelling}
              onClick={() => void state.cancel()}
            >
              {state.cancelling ? 'Cancelling…' : 'Cancel upload'}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label="Dismiss job description upload"
              onClick={() => void state.dismiss()}
            >
              <XIcon aria-hidden="true" className="size-4" />
              Dismiss
            </Button>
          )}
        </div>
      </div>
      {state.transferring && (
        <div
          role="progressbar"
          aria-label="Job description file transfer"
          aria-valuenow={state.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-2 h-1 overflow-hidden rounded-full bg-primary/10"
        >
          <div className="h-full bg-primary" style={{ width: `${state.progress}%` }} />
        </div>
      )}
      {error ? (
        <details className="mt-2 text-caption text-danger">
          <summary className="cursor-pointer font-medium">Upload details</summary>
          <p role="alert" className="mt-1 max-h-24 overflow-y-auto break-words">
            {error}
          </p>
        </details>
      ) : (
        active && (
          <p className="mt-1 pl-12 text-caption text-ink-muted">
            You can switch pages. Your upload will keep running until it finishes or you cancel.
          </p>
        )
      )}
    </section>
  )
}
