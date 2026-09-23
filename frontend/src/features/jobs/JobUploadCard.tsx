import { CheckCircle2Icon, FileUpIcon, Loader2Icon, SparklesIcon } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { useExtractJobDescription } from '@/features/jobs/api'
import { extractionToForm, type JobFormValues } from '@/features/jobs/job-form-schema'
import { describeError } from '@/lib/errors'
import { cn } from '@/lib/utils'

const MAX_FILE_MB = 10
const ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Create mode only: drop the job description as a PDF or Word file and the AI
 * fills the form from it. One job description per file; a file with none or
 * with several is refused by the server and the message shown here.
 */
export function JobUploadCard({
  onExtracted,
}: {
  onExtracted: (values: Partial<JobFormValues>) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [filledFrom, setFilledFrom] = useState('')
  const extract = useExtractJobDescription()

  async function read(files: FileList | null) {
    const file = files?.[0]
    if (!file || extract.isPending) return
    setFilledFrom('')
    if (files.length > 1) {
      setError('Drop one file at a time: a file holds one job description.')
      return
    }
    const suffix = file.name.toLowerCase().split('.').pop()
    if (suffix !== 'pdf' && suffix !== 'docx') {
      setError('Upload a PDF or a Word (.docx) file.')
      return
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`The file is larger than ${MAX_FILE_MB} MB.`)
      return
    }
    setError('')
    try {
      const result = await extract.mutateAsync(file)
      const values = extractionToForm(result.fields)
      const count = Object.keys(values).length
      if (count === 0) {
        setError(
          `Nothing could be read from ${result.file_name}. Check that it is a job description.`,
        )
        return
      }
      onExtracted(values)
      setFilledFrom(result.file_name)
      toast.success(`Filled ${count} field${count === 1 ? '' : 's'} from ${result.file_name}.`)
    } catch (caught) {
      setError(describeError(caught))
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void read(event.dataTransfer.files)
  }

  const pending = extract.isPending

  return (
    <section
      aria-labelledby="heading-upload"
      className="rounded-card border border-line bg-surface p-5 shadow-card md:p-6"
    >
      <h2
        id="heading-upload"
        className="flex items-center gap-2 text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase"
      >
        <SparklesIcon aria-hidden="true" className="size-3.5" />
        Fill from a file
      </h2>
      <div
        role="button"
        tabIndex={pending ? -1 : 0}
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onClick={() => !pending && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (!pending && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragOver={(event) => {
          event.preventDefault()
          if (!pending) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'mt-4 flex items-center gap-4 rounded-card border-2 border-dashed px-5 py-4 transition-colors duration-150 ease-brand',
          pending
            ? 'cursor-wait border-line bg-surface-2'
            : 'cursor-pointer border-line-strong bg-surface-2 hover:border-ink',
          dragging && 'border-accent bg-accent-soft',
        )}
      >
        {/* pointer-events-none: a drag crossing a child must not fire the zone's dragleave. */}
        <span className="pointer-events-none inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-accent">
          {pending ? (
            <Loader2Icon aria-hidden="true" className="size-5 animate-spin" />
          ) : (
            <FileUpIcon aria-hidden="true" className="size-5" />
          )}
        </span>
        <span className="pointer-events-none min-w-0">
          <span className="block font-medium text-ink">
            {pending
              ? 'Reading the job description with AI…'
              : 'Drop the job description here, or click to choose'}
          </span>
          <span className="block text-small text-ink-muted">
            PDF or Word (.docx), one job description per file, up to {MAX_FILE_MB} MB. The AI fills
            in the fields below for you to review.
          </span>
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            void read(event.target.files)
            event.target.value = ''
          }}
        />
      </div>
      {error && (
        <p role="alert" className="mt-3 text-small text-danger">
          {error}
        </p>
      )}
      {filledFrom && !error && (
        <p role="status" className="mt-3 flex items-center gap-1.5 text-small text-success">
          <CheckCircle2Icon aria-hidden="true" className="size-4" />
          Filled from {filledFrom}. Review the fields below before saving.
        </p>
      )}
    </section>
  )
}
