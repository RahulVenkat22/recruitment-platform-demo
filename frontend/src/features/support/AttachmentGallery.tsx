import { formatBytes } from '@/features/support/support-utils'
import { cn } from '@/lib/utils'
import type { TicketAttachment } from '@/types/domain'

/** Saved images and videos: an image opens full size in a new tab, a video plays in place. */
export function AttachmentGallery({
  attachments,
  className,
}: {
  attachments: readonly TicketAttachment[]
  className?: string
}) {
  if (attachments.length === 0) return null
  return (
    <ul aria-label="Attachments" className={cn('flex flex-wrap gap-3', className)}>
      {attachments.map((file) => (
        <li key={file.id} className="max-w-full min-w-0">
          {file.kind === 'video' ? (
            <video
              controls
              preload="metadata"
              src={file.url}
              className="max-h-64 w-full max-w-md rounded-card border border-line bg-graphite"
            />
          ) : (
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-card border border-line bg-surface-2"
            >
              <img
                src={file.url}
                alt={file.name}
                loading="lazy"
                className="max-h-48 w-auto max-w-xs object-contain"
              />
            </a>
          )}
          <p className="mt-1 max-w-xs truncate text-caption text-ink-subtle" title={file.name}>
            {file.name} · {formatBytes(file.size)}
          </p>
        </li>
      ))}
    </ul>
  )
}
