import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { FileUpIcon, Loader2Icon, SparklesIcon } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useExtractJobDescription } from '@/features/jobs/api'
import { extractionToForm } from '@/features/jobs/job-form-schema'
import { describeError } from '@/lib/errors'
import { cn } from '@/lib/utils'

const MAX_FILE_MB = 10
const ACCEPT =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * The Job Descriptions page's opening panel: drop a JD as a PDF or Word file
 * and the AI reads it into a new job description. The New Job Description
 * page then opens with the fields filled in for review; nothing is created
 * until it is submitted there. Behind the copy loops a short brand animation
 * of documents flowing into the matching core and out to roles
 * (public/brand/jd-upload-loop.mp4 and .webm); it stays still under reduced
 * motion. One job description per file; a file with none or with several is
 * refused by the server and the message shown here.
 */
export function JobUploadPanel({ className }: { className?: string }) {
  const navigate = useNavigate()
  const reducedMotion = useMotionPreference()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const extract = useExtractJobDescription()
  const pending = extract.isPending

  async function read(files: FileList | null) {
    const file = files?.[0]
    if (!file || pending) return
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
      toast.success(
        `Read ${count} field${count === 1 ? '' : 's'} from ${result.file_name}. Review them, then create the job description.`,
      )
      navigate('/jobs/new', { state: { prefill: values, filledFrom: result.file_name } })
    } catch (caught) {
      setError(describeError(caught))
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    void read(event.dataTransfer.files)
  }

  return (
    <section
      aria-labelledby="heading-upload"
      data-surface="dark"
      className={cn(
        'relative isolate overflow-hidden rounded-card border border-white/10 bg-graphite text-ink shadow-card',
        className,
      )}
    >
      {!reducedMotion && (
        <video
          aria-hidden="true"
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 size-full object-cover"
        >
          <source src="/brand/jd-upload-loop.mp4" type="video/mp4" />
          <source src="/brand/jd-upload-loop.webm" type="video/webm" />
        </video>
      )}
      {/* Solid on the left where the copy sits, clear over the animation on the right; phones dim it all. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-graphite via-graphite/85 to-graphite/15"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-graphite/45 md:hidden" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent"
      />

      <div className="relative grid gap-6 p-6 md:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] md:items-center md:gap-8 md:p-8">
        <div className="[text-shadow:0_2px_24px_rgb(0_0_0/0.7)]">
          <h2
            id="heading-upload"
            className="flex items-center gap-2 text-caption font-medium tracking-[0.14em] text-accent uppercase"
          >
            <SparklesIcon aria-hidden="true" className="size-3.5" />
            Create from a file
          </h2>
          <p className="mt-3 font-heading text-[24px]/[30px] font-semibold tracking-[-0.02em] text-white lg:text-[28px]/[34px]">
            Already have the job description written?
          </p>
          <p className="mt-2 max-w-[36rem] text-[15px]/[24px] text-ink-muted">
            Drop it here as a PDF or Word file. TalentOS reads the title, skills, experience, salary
            and responsibilities into a new job description for you to review. Nothing is created
            until you save it.
          </p>
        </div>

        <div>
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
              'relative flex items-center gap-4 overflow-hidden rounded-[14px] border-2 border-dashed px-5 py-5 backdrop-blur-md transition-colors duration-150 ease-brand',
              pending
                ? 'cursor-wait border-white/15 bg-white/[0.06]'
                : 'cursor-pointer border-white/25 bg-white/[0.06] hover:border-accent/80 hover:bg-accent/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
              dragging && 'border-accent bg-accent/15',
            )}
          >
            {/* pointer-events-none: a drag crossing a child must not fire the zone's dragleave. */}
            <span className="pointer-events-none inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-graphite shadow-[0_0_24px_rgb(196_214_0/0.45)]">
              {pending ? (
                <Loader2Icon aria-hidden="true" className="size-5 animate-spin" />
              ) : (
                <FileUpIcon aria-hidden="true" className="size-5" />
              )}
            </span>
            <span className="pointer-events-none min-w-0">
              <span className="block font-medium text-white">
                {pending
                  ? 'Reading the job description with AI…'
                  : 'Drop the job description here, or click to choose'}
              </span>
              <span className="mt-0.5 block text-small text-ink-muted">
                PDF or Word (.docx), one job description per file, up to {MAX_FILE_MB} MB.
              </span>
            </span>
            {pending && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-white/10"
              >
                <span className="block h-full w-1/3 bg-accent animate-bh-scan" />
              </span>
            )}
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
            <p
              role="alert"
              className="mt-2 rounded-control bg-danger-soft px-3 py-2 text-small text-danger"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
