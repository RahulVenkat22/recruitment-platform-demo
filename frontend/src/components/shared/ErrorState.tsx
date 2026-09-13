import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/errors'
import { cn } from '@/lib/utils'

export interface ErrorStateProps {
  title?: string
  /** Explicit text; wins over anything derived from `error`. */
  message?: string
  /** Any thrown value; axios errors carrying the plan.md 6.10 envelope give their server message. */
  error?: unknown
  onRetry?: () => void
  retryLabel?: string
  /** `block` (default) for page bodies; `inline` is a slim banner for a section inside a page. */
  variant?: 'block' | 'inline'
  className?: string
}

/**
 * Error surface with a retry (plan.md 7.4, 8.4): rose soft icon, plain-language
 * message that says what happened. Query errors inside a section use the
 * `inline` variant so the rest of the page stays usable.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  error,
  onRetry,
  retryLabel = 'Try again',
  variant = 'block',
  className,
}: ErrorStateProps) {
  const text = message ?? describeError(error)

  if (variant === 'inline') {
    return (
      <div
        role="alert"
        data-slot="error-state"
        data-variant="inline"
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-danger-soft px-3.5 py-2.5 text-small text-danger',
          className,
        )}
      >
        <TriangleAlertIcon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="font-medium">{title}.</span> {text}
        </span>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry} className="ml-auto">
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            {retryLabel}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div
      role="alert"
      data-slot="error-state"
      data-variant="block"
      className={cn('flex flex-col items-center gap-3 px-6 py-14 text-center', className)}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger [&_svg]:size-7"
      >
        <TriangleAlertIcon strokeWidth={1.75} />
      </span>
      <h3 className="text-h3 text-ink">{title}</h3>
      <p className="max-w-md text-ink-muted">{text}</p>
      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry} className="mt-2">
          <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
