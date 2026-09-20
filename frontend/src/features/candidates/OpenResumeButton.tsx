import { ExternalLinkIcon, FileTextIcon, Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { fetchResumeLink } from '@/features/candidates/api'
import { describeError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { ResumeDocumentSummary } from '@/types/domain'

export interface OpenResumeButtonProps {
  candidateId: string
  /** The ingested PDF behind the profile, when there is one. */
  resume: ResumeDocumentSummary | null | undefined
  /** A plain external link (legacy `resume_url`) used when no PDF was ingested. */
  fallbackUrl?: string | null
  /** `link` renders like the header's LinkedIn/GitHub anchors; `button` is the profile card action. */
  variant?: 'link' | 'button'
  className?: string
}

/**
 * Opens the candidate's resume. Ingested PDFs live in S3 and are opened through
 * a short-lived link from `GET /candidates/{id}/resume-link/`; when the API
 * cannot give one (S3 not configured yet, file not uploaded, signing failed) the
 * server's own sentence is shown, so the reason is never a mystery.
 */
export function OpenResumeButton({
  candidateId,
  resume,
  fallbackUrl,
  variant = 'button',
  className,
}: OpenResumeButtonProps) {
  const [busy, setBusy] = useState(false)

  if (!resume) {
    if (!fallbackUrl) return null
    return (
      <a
        href={fallbackUrl}
        target="_blank"
        rel="noreferrer"
        className={cn(
          'inline-flex items-center gap-1 text-primary hover:underline',
          variant === 'button' && 'mt-3 text-small font-medium',
          className,
        )}
      >
        <FileTextIcon aria-hidden="true" className={variant === 'button' ? 'size-4' : 'size-3.5'} />
        {variant === 'button' ? 'Open resume' : 'Resume'}
        <ExternalLinkIcon aria-hidden="true" className="size-3" />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    )
  }

  async function open() {
    if (busy) return
    setBusy(true)
    // Open the tab synchronously so browsers do not treat the later navigation as a pop-up.
    const popup = window.open('', '_blank')
    try {
      const link = await fetchResumeLink(candidateId)
      if (popup) {
        popup.opener = null
        popup.location.href = link.url
      } else {
        window.location.assign(link.url)
      }
    } catch (error) {
      popup?.close()
      toast.error(describeError(error), { duration: 8000 })
    } finally {
      setBusy(false)
    }
  }

  const label = variant === 'button' ? `Open resume (${resume.file_name})` : 'Resume'
  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        aria-busy={busy || undefined}
        className={cn(
          'inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-60',
          className,
        )}
      >
        {busy ? (
          <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
        ) : (
          <FileTextIcon aria-hidden="true" className="size-3.5" />
        )}
        {label}
        <span className="sr-only">(opens in a new tab)</span>
      </button>
    )
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void open()}
      disabled={busy}
      aria-busy={busy || undefined}
      className={cn('mt-3', className)}
    >
      {busy ? (
        <Loader2Icon aria-hidden="true" className="animate-spin" />
      ) : (
        <FileTextIcon data-icon="inline-start" aria-hidden="true" />
      )}
      {label}
      <ExternalLinkIcon aria-hidden="true" className="size-3" />
    </Button>
  )
}
