import { WorkflowGuide } from '@/components/shared/WorkflowGuide'
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CopyIcon,
  FileTextIcon,
  FileXIcon,
  Loader2Icon,
  LockIcon,
  TriangleAlertIcon,
  UploadCloudIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { parsedWithAi } from '@/features/candidates/candidate-utils'
import {
  isBatchFinished,
  useInvalidateAfterUpload,
  useUploadBatch,
  useUploadBatches,
  useUploadResumes,
} from '@/features/resumes/api'
import { useAuthStore } from '@/lib/auth-store'
import { describeError } from '@/lib/errors'
import { formatRelative } from '@/lib/format'
import { param, useUrlState } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import type { IntakeResult, UploadBatch, UploadedDocument } from '@/types/domain'

const SPEC = { batch: param.string('') }
const MAX_FILE_MB = 20

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`
}

function Card({
  title,
  children,
  className,
  aside,
}: {
  title: string
  children: React.ReactNode
  className?: string
  aside?: React.ReactNode
}) {
  return (
    <section
      className={cn('rounded-card border border-line bg-surface p-5 shadow-card', className)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * Warnings that change what a recruiter should DO, in the order they matter.
 *
 * The list arrives in pipeline order, which is not importance order: the page
 * used to render `warnings.slice(0, 2)`, so on exactly the documents with the
 * most to say — a scan, which collects extractor notes first — the two that
 * decide whether the candidate is usable at all ("will not appear in semantic
 * search", "the contact details disagree") were the ones pushed out of sight.
 * Matching on a distinctive fragment of each message rather than on the whole
 * string: the messages interpolate counts, addresses and model names.
 */
// Ordered most alarming first; a warning matching none of these sorts last and
// so hides behind "Show N more". Anything describing a value that was taken
// from somewhere other than the model's reading of the page, or an identity key
// that was refused, has to be visible without expanding -- that is the entire
// user-facing output of the all-or-nothing rule in `resumes.engines.parsing`,
// and the first version of these warnings matched no fragment here at all.
//
// Two rules this list has been got wrong by, both of which cost a document its
// only visible line:
//
//   * A fragment must be UNIQUE to one message. Two different warnings both
//     ending "will not appear in semantic search" -- the cause, from `parse`,
//     and the consequence, from `chunk` -- shared the top entry, always fired
//     together and so took both visible slots to say one thing. They are worded
//     apart now and matched apart here.
//   * Every message the backend can emit about a CONTACT DETAIL has to match
//     something, and every fragment here must still be emitted by the backend:
//     a stale fragment is harmless on its own, but a warning that matches
//     nothing sorts last and hides the visible output of the case it was for
//     behind "Show N more".
const WARNING_PRIORITY = [
  // The candidate exists but cannot be found.
  'no embeddable content',
  // An identity refused, or a contact value the guards dropped.
  'already belongs to',
  'placeholder identity used',
  'is not a usable address',
  'is not a usable number',
  // Nothing was stored at all.
  'survived validation',
  'returned no name, contact details',
  'could not read the PDF',
  // The text layer was missing, a fallback model answered, or a value had to
  // come from somewhere other than the model.
  'no text layer',
  'taken from the file name',
  'was busy',
  // A row the guards dropped. Last, but not unranked: an unmatched warning
  // sorts into the same bucket as every other unmatched one, so a document
  // with several of these could still push a ranked warning out of sight.
  'experience without a start date',
]

function warningRank(warning: string): number {
  const found = WARNING_PRIORITY.findIndex((fragment) => warning.includes(fragment))
  return found === -1 ? WARNING_PRIORITY.length : found
}

function DocumentWarnings({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false)
  if (warnings.length === 0) return null
  // Keyed by the warning's position in the document's own list, not by its
  // text: `validate` can emit two byte-identical warnings for one document
  // (the same sentence for the email and for the phone, say), and duplicate
  // React keys drop one of the two silently.
  const ordered = warnings
    .map((warning, index) => ({ warning, index }))
    .sort((a, b) => warningRank(a.warning) - warningRank(b.warning) || a.index - b.index)
  const shown = expanded ? ordered : ordered.slice(0, 2)
  return (
    <div className="mt-1 text-caption text-ink-subtle">
      <ul className={cn(ordered.length > 1 && 'space-y-0.5')}>
        {shown.map((item) => (
          <li key={item.index}>{item.warning}</li>
        ))}
      </ul>
      {ordered.length > 2 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-0.5 font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          {expanded ? 'Show less' : `Show ${ordered.length - 2} more`}
        </button>
      )}
    </div>
  )
}

/** The status pill of one uploaded file; `active` marks the file the worker is on. */
function DocumentStatus({ document, active }: { document: UploadedDocument; active: boolean }) {
  const base = 'inline-flex h-6 items-center gap-1 rounded-pill px-2 text-caption font-medium'
  switch (document.status) {
    case 'parsed':
      return (
        <span className={cn(base, 'bg-success-soft text-success')}>
          <CheckCircle2Icon aria-hidden="true" className="size-3" /> Added
        </span>
      )
    case 'needs_review':
      return (
        <span className={cn(base, 'bg-warning-soft text-warning')}>
          <TriangleAlertIcon aria-hidden="true" className="size-3" /> Needs review
        </span>
      )
    case 'failed':
      return (
        <span className={cn(base, 'bg-danger-soft text-danger')}>
          <CircleAlertIcon aria-hidden="true" className="size-3" /> Failed
        </span>
      )
    case 'superseded':
      return <span className={cn(base, 'bg-surface-2 text-ink-muted')}>Replaced</span>
    default:
      return active ? (
        <span className={cn(base, 'bg-accent-soft text-ink')}>
          <Loader2Icon aria-hidden="true" className="size-3 animate-spin" /> Processing…
        </span>
      ) : (
        <span className={cn(base, 'bg-surface-2 text-ink-muted')}>Waiting</span>
      )
  }
}

function BatchProgress({ batch }: { batch: UploadBatch }) {
  const pct = batch.total ? Math.round((batch.done / batch.total) * 100) : 0
  const activeId = batch.running
    ? batch.documents.find((document) => document.status === 'pending')?.id
    : undefined
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-small">
          <span className="font-medium text-ink">
            {batch.running
              ? `Processing ${batch.done + 1} of ${batch.total}…`
              : batch.stalled
                ? `${batch.total - batch.done} file(s) waiting for processing to resume`
                : `${batch.done} of ${batch.total} processed`}
          </span>
          <span className="text-ink-muted tabular-nums">
            {batch.counts.parsed} added · {batch.counts.needs_review} to review ·{' '}
            {batch.counts.failed} failed
          </span>
        </div>
        <Progress value={pct} aria-label="Upload progress" />
        {batch.stalled && (
          <p className="text-caption text-warning">
            Your files are saved, but processing was interrupted.{' '}
            <Link to="/support" className="font-medium underline underline-offset-2">
              Contact support
            </Link>{' '}
            to resume this upload.
          </p>
        )}
        {batch.queue_position > 0 && batch.running === false && (
          <p className="text-caption text-ink-subtle">
            {batch.queue_position} batch(es) ahead of this one in the queue.
          </p>
        )}
      </div>
      <ul className="divide-y divide-line">
        {batch.documents.map((document) => (
          <li
            key={document.id}
            className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3 text-small"
          >
            <FileTextIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{document.file_name}</p>
              <p className="text-caption text-ink-muted">
                {formatBytes(document.file_size)}
                {document.page_count ? ` · ${document.page_count} pages` : ''}
                {document.chunk_count ? ` · ${document.chunk_count} chunks indexed` : ''}
                {parsedWithAi(document.parse_source) ? ' · parsed with AI' : ''}
                {document.processing_ms ? ` · ${Math.round(document.processing_ms / 1000)}s` : ''}
              </p>
              {document.status_reason && (
                <p className="mt-1 text-caption text-warning">{document.status_reason}</p>
              )}
              <DocumentWarnings warnings={document.warnings} />
            </div>
            <div className="flex items-center gap-3">
              <DocumentStatus document={document} active={document.id === activeId} />
              {document.candidate && (
                <Link
                  to={`/candidates/${document.candidate.id}`}
                  className="inline-flex items-center gap-2 text-small font-medium text-primary hover:underline"
                >
                  <Avatar
                    name={document.candidate.full_name}
                    src={document.candidate.avatar_url}
                    size="sm"
                  />
                  {document.candidate.full_name}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Files the server answered about immediately: duplicates and rejections. */
function IntakeNotes({ result }: { result: IntakeResult }) {
  if (result.duplicates.length === 0 && result.rejected.length === 0) return null
  return (
    <ul className="space-y-1.5 text-small">
      {result.duplicates.map((item) => (
        <li key={`dup-${item.file_name}`} className="flex items-start gap-2 text-ink-muted">
          <CopyIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium text-ink">{item.file_name}</span> is already in the library
            {item.candidate_id && (
              <>
                {' '}
                as{' '}
                <Link
                  to={`/candidates/${item.candidate_id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {item.candidate_name}
                </Link>
              </>
            )}
            .
          </span>
        </li>
      ))}
      {result.rejected.map((item) => (
        <li key={`rej-${item.file_name}`} className="flex items-start gap-2 text-danger">
          <FileXIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">{item.file_name}</span> was not accepted: {item.reason}.
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Upload resume PDFs from the browser (any number). Files are validated and
 * queued on the server; this page polls the batch and shows every file's
 * status, the candidate it became, and why a file needs review or failed.
 */
export default function UploadResumesPage() {
  const user = useAuthStore((state) => state.user)
  const canUpload = user?.role === 'hr_admin' || user?.role === 'hr'
  const [state, setState] = useUrlState(SPEC)
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [intake, setIntake] = useState<IntakeResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useUploadResumes()
  const batch = useUploadBatch(state.batch || undefined)
  const batches = useUploadBatches()
  const invalidate = useInvalidateAfterUpload()
  const announcedRef = useRef<string | null>(null)

  // Once a batch finishes, refresh the candidate lists and say how it went.
  useEffect(() => {
    const data = batch.data
    if (!data || !isBatchFinished(data) || announcedRef.current === data.batch_id) return
    announcedRef.current = data.batch_id
    void invalidate().then(() => {
      const { parsed, needs_review, failed } = data.counts
      const message = `${parsed} resume${parsed === 1 ? '' : 's'} added to the library`
      if (failed || needs_review) {
        toast.warning(`${message}; ${needs_review} need review, ${failed} failed`)
      } else if (parsed > 0) {
        toast.success(message)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.data])

  function addFiles(list: FileList | File[] | null) {
    if (!list) return
    const incoming = Array.from(list)
    setFiles((current) => {
      const known = new Set(current.map(fileKey))
      return [...current, ...incoming.filter((file) => !known.has(fileKey(file)))]
    })
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  async function submit() {
    if (files.length === 0 || upload.isPending) return
    try {
      const result = await upload.mutateAsync(files)
      setIntake(result)
      setFiles([])
      announcedRef.current = null
      if (result.accepted.length > 0) {
        setState({ batch: result.batch_id })
      } else {
        toast.warning('No file was accepted for processing.')
      }
    } catch (error) {
      toast.error(describeError(error), { duration: 8000 })
    }
  }

  const notPdf = files.filter((file) => !file.name.toLowerCase().endsWith('.pdf'))
  const tooBig = files.filter((file) => file.size > MAX_FILE_MB * 1024 * 1024)
  const invalid = new Set([...notPdf, ...tooBig].map(fileKey))
  const uploadable = files.filter((file) => !invalid.has(fileKey(file)))

  if (!canUpload) {
    return (
      <>
        <PageHeader
          title="Upload resumes"
          breadcrumbs={[{ label: 'Candidates', to: '/candidates' }, { label: 'Upload resumes' }]}
        />
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={LockIcon}
            title="HR staff only"
            description="Uploading resumes into the library is limited to HR roles."
          />
        </div>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Upload resumes"
        subtitle="Drop PDF resumes here. Each one is parsed, becomes a candidate profile and is indexed for semantic search."
        breadcrumbs={[{ label: 'Candidates', to: '/candidates' }, { label: 'Upload resumes' }]}
      />
      <WorkflowGuide
        label="From resume to opportunity"
        steps={[
          {
            title: '01 · Bring your resumes',
            description: 'Drop PDFs or choose files from your device.',
          },
          {
            title: '02 · Discover the details',
            description: 'AI reads skills, experience and education.',
          },
          {
            title: '03 · Make talent searchable',
            description: 'Profiles join your internal candidate library.',
          },
        ]}
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card title="Files">
            <div
              role="button"
              tabIndex={0}
              aria-label="Choose PDF files or drop them here"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  inputRef.current?.click()
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors duration-150 ease-brand',
                dragging
                  ? 'border-accent bg-accent-soft'
                  : 'border-line-strong bg-surface-2 hover:border-ink',
              )}
            >
              <span className="inline-flex size-12 items-center justify-center rounded-full bg-ink text-accent">
                <UploadCloudIcon aria-hidden="true" className="size-6" />
              </span>
              <p className="font-medium text-ink">Drop resumes here, or click to choose</p>
              <p className="text-small text-ink-muted">
                PDF only, up to {MAX_FILE_MB} MB each. Select as many as you like.
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept=".pdf,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </div>

            {files.length > 0 && (
              <ul className="mt-4 divide-y divide-line">
                {files.map((file) => {
                  const bad = invalid.has(fileKey(file))
                  return (
                    <li key={fileKey(file)} className="flex items-center gap-3 py-2 text-small">
                      <FileTextIcon
                        aria-hidden="true"
                        className={cn('size-4 shrink-0', bad ? 'text-danger' : 'text-ink-subtle')}
                      />
                      <span className={cn('min-w-0 flex-1 truncate', bad && 'text-danger')}>
                        {file.name}
                        {bad && (
                          <span className="ml-2 text-caption">
                            {file.name.toLowerCase().endsWith('.pdf')
                              ? `larger than ${MAX_FILE_MB} MB`
                              : 'not a PDF'}
                          </span>
                        )}
                      </span>
                      <span className="text-caption text-ink-muted tabular-nums">
                        {formatBytes(file.size)}
                      </span>
                      <button
                        type="button"
                        aria-label={`Remove ${file.name}`}
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((item) => fileKey(item) !== fileKey(file)),
                          )
                        }
                        className="rounded-control p-1 text-ink-subtle hover:bg-surface-2 hover:text-ink"
                      >
                        <XIcon aria-hidden="true" className="size-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={uploadable.length === 0 || upload.isPending}
                aria-busy={upload.isPending || undefined}
              >
                {upload.isPending ? (
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                ) : (
                  <UploadCloudIcon data-icon="inline-start" aria-hidden="true" />
                )}
                {upload.isPending
                  ? 'Uploading…'
                  : `Upload ${uploadable.length || ''} ${uploadable.length === 1 ? 'file' : 'files'}`.replace(
                      '  ',
                      ' ',
                    )}
              </Button>
              {files.length > 0 && (
                <Button type="button" variant="ghost" onClick={() => setFiles([])}>
                  Clear
                </Button>
              )}
              <span className="text-caption text-ink-subtle">
                Your files keep processing if you leave. Return here to follow their progress.
              </span>
            </div>
          </Card>

          {intake && (intake.duplicates.length > 0 || intake.rejected.length > 0) && (
            <Card title="Not queued">
              <IntakeNotes result={intake} />
            </Card>
          )}

          {state.batch && (
            <Card
              title="This upload"
              aside={
                batch.data?.running ? (
                  <span className="inline-flex items-center gap-1.5 text-caption text-ink-muted">
                    <Loader2Icon aria-hidden="true" className="size-3.5 animate-spin" />
                    Live
                  </span>
                ) : undefined
              }
            >
              {batch.isPending ? (
                <div className="space-y-3">
                  <Skeleton className="h-2 w-full rounded-pill" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : batch.isError ? (
                <ErrorState
                  variant="inline"
                  title="Couldn't load this upload"
                  error={batch.error}
                  onRetry={() => void batch.refetch()}
                />
              ) : batch.data ? (
                <BatchProgress batch={batch.data} />
              ) : null}
            </Card>
          )}
        </div>

        <Card title="Recent uploads">
          {batches.isPending ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : batches.isError ? (
            <ErrorState
              variant="inline"
              title="Couldn't load uploads"
              error={batches.error}
              onRetry={() => void batches.refetch()}
            />
          ) : (batches.data ?? []).length === 0 ? (
            <p className="text-small text-ink-subtle">No uploads yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(batches.data ?? []).map((row) => (
                <li key={row.batch_id}>
                  <button
                    type="button"
                    onClick={() => setState({ batch: row.batch_id })}
                    aria-current={row.batch_id === state.batch ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-control px-2 py-2 text-left text-small hover:bg-surface-2',
                      row.batch_id === state.batch && 'bg-surface-2',
                    )}
                  >
                    <span>
                      <span className="font-medium text-ink">
                        {row.total} file{row.total === 1 ? '' : 's'}
                      </span>
                      <span className="block text-caption text-ink-muted">
                        {formatRelative(row.created_at)}
                      </span>
                    </span>
                    <span className="text-caption text-ink-muted tabular-nums">
                      {row.pending > 0
                        ? `${row.pending} pending`
                        : `${row.parsed} added${row.failed ? `, ${row.failed} failed` : ''}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
