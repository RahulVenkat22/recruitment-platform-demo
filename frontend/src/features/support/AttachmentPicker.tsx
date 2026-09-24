import { FilmIcon, PaperclipIcon, XIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_MB,
  ATTACHMENTS_MAX,
  attachmentProblem,
  formatBytes,
} from '@/features/support/support-utils'
import { cn } from '@/lib/utils'

export interface AttachmentPickerProps {
  /** Id of the "Add" button, for a field label. */
  id?: string
  files: readonly File[]
  onChange: (files: File[]) => void
  disabled?: boolean
  className?: string
}

/**
 * A chosen file as a tile: the image itself, or the video's first frame. The
 * object URL is not revoked: React's development double effects would tear it
 * down under a live tile, and the page releases it on unload anyway.
 */
function Preview({ file }: { file: File }) {
  const [url] = useState(() => URL.createObjectURL(file))
  if (file.type.startsWith('video/')) {
    return (
      <video src={url} muted playsInline preload="metadata" className="size-full object-cover" />
    )
  }
  return <img src={url} alt="" className="size-full object-cover" />
}

/**
 * Images and videos to send with a ticket or a comment: pick them, see them as
 * tiles, drop any before sending. The limits mirror backend/support/models.py.
 */
export function AttachmentPicker({
  id,
  files,
  onChange,
  disabled,
  className,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  function add(list: FileList | null) {
    if (!list) return
    const next = [...files]
    let problem = ''
    for (const file of Array.from(list)) {
      const reason = attachmentProblem(file)
      if (reason) {
        problem ||= reason
        continue
      }
      if (next.length >= ATTACHMENTS_MAX) {
        problem ||= `Up to ${ATTACHMENTS_MAX} files at a time.`
        break
      }
      next.push(file)
    }
    setError(problem)
    onChange(next)
  }

  return (
    <div className={cn('space-y-2', className)}>
      {files.length > 0 && (
        <ul aria-label="Files to attach" className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}`}
              title={file.name}
              className="relative size-20 overflow-hidden rounded-card border border-line bg-surface-2"
            >
              <Preview file={file} />
              <span className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-pill bg-graphite/80 px-1.5 py-0.5 text-[10px] text-white">
                {file.type.startsWith('video/') && (
                  <FilmIcon aria-hidden="true" className="size-3" />
                )}
                {formatBytes(file.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                disabled={disabled}
                onClick={() => onChange(files.filter((_, at) => at !== index))}
                className="absolute top-1 right-1 inline-flex size-5 items-center justify-center rounded-full bg-graphite/80 text-white transition-colors duration-150 ease-brand hover:bg-danger focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
              >
                <XIcon aria-hidden="true" className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          id={id}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || files.length >= ATTACHMENTS_MAX}
          onClick={() => inputRef.current?.click()}
        >
          <PaperclipIcon data-icon="inline-start" aria-hidden="true" />
          Add images or videos
        </Button>
        <span className="text-caption text-ink-subtle">
          Up to {ATTACHMENTS_MAX} files, {ATTACHMENT_MAX_MB} MB each.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            add(event.target.files)
            event.target.value = ''
          }}
        />
      </div>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
