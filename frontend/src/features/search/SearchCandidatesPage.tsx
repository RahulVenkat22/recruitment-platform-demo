import type { RowSelectionState } from '@tanstack/react-table'
import {
  BriefcaseIcon,
  CheckIcon,
  DatabaseIcon,
  FileTextIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  MailIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UserSearchIcon,
  type LucideIcon,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FilterPopover } from '@/components/shared/FilterPopover'
import { PageHeader } from '@/components/shared/PageHeader'
import { SkeletonText } from '@/components/shared/Skeletons'
import { SkillChips } from '@/components/shared/SkillChips'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  isRunFinished,
  useApplications,
  useInvalidatePipeline,
  useRunSearch,
  useSearchRun,
  useSearchRuns,
  useSources,
} from '@/features/applications/api'
import {
  APPLICATION_SORT_OPTIONS,
  MATCH_FLOOR_OPTIONS,
  STATUS_GROUP_OPTIONS,
} from '@/features/applications/application-utils'
import { ApplicationsTable } from '@/features/applications/ApplicationsTable'
import { useApplicationActions } from '@/features/applications/useApplicationActions'
import { useJob, useJobList } from '@/features/jobs/api'
import { isWorkable, jobSummaryLine, skillChips } from '@/features/jobs/job-utils'
import { skillLabel } from '@/features/jobs/job-utils'
import { AISearchLoader } from '@/features/search/AISearchLoader'
import { useEnumOptions } from '@/lib/enums'
import { describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { param, useDebounce, useIsMobile, useUrlState } from '@/lib/hooks'
import { focusRovingSibling, rovingIndex } from '@/lib/keyboard'
import { EASE_BRAND } from '@/lib/motion'
import { useUiStore, type PageSize } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import {
  personFromUser,
  type JobRow,
  type QueryPlan,
  type SearchProgress,
  type SearchResponse,
  type SearchRun,
} from '@/types/domain'

const SEARCH_SPEC = {
  jd: param.string(''),
  q: param.string(''),
  group: param.string('all'),
  source: param.list<string>([]),
  min: param.number(0),
  sort: param.string('-match__overall_pct'),
  page: param.number(1),
  view: param.enum<'table' | 'cards'>('table', ['table', 'cards']),
}

const SOURCE_ICONS: Record<string, LucideIcon> = {
  internal: DatabaseIcon,
  referral: MailIcon,
  naukri: BriefcaseIcon,
  linkedin: LinkIcon,
  resume: FileTextIcon,
}

const STATUS_RANK: Record<string, number> = {
  open: 0,
  on_hold: 1,
  draft: 2,
  closed: 3,
  force_closed: 4,
  archived: 5,
}

const VIEW_OPTIONS = [
  { key: 'table', label: 'Table', Icon: ListIcon },
  { key: 'cards', label: 'Cards', Icon: LayoutGridIcon },
] as const

/** Source tiles sit four across on desktop and two across on phones. */
const SOURCE_TILE = 'min-w-44 max-sm:min-w-0 max-sm:basis-[calc(50%-0.375rem)]'
const SOURCE_TILE_HEIGHT = 'h-[58px]'

function StepLabel({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase">
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-ink text-[11px] text-white tabular-nums">
        {step}
      </span>
      {children}
    </h3>
  )
}

function formatDuration(ms: number | null | undefined): string {
  if (!ms) return ''
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

/** What the AI read in the job description before searching (SearchRun.query_plan). */
function AIBrief({ plan }: { plan: QueryPlan | null }) {
  if (!plan || plan.source !== 'llm') return null
  const inferred = plan.inferred_skills ?? []
  if (!plan.ideal_candidate && inferred.length === 0) return null
  return (
    <div
      data-slot="ai-brief"
      className="rounded-card border border-line bg-surface px-4 py-3 text-small shadow-card"
    >
      <p className="flex items-start gap-2 text-ink">
        <SparklesIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent-ink" />
        <span>
          <span className="font-medium">AI brief: </span>
          {plan.ideal_candidate}
        </span>
      </p>
      {inferred.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
          <span>Also looked for</span>
          {inferred.map((key) => (
            <span key={key} className="rounded-pill bg-surface-2 px-2 py-0.5 text-ink">
              {skillLabel(key)}
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

/** The search failed: say so plainly and offer to run it again (Enhancement.md 7). */
function SearchFailed({
  error,
  onRetry,
  onDismiss,
  retrying,
}: {
  error: unknown
  onRetry: () => void
  onDismiss: () => void
  retrying: boolean
}) {
  return (
    <section
      role="alert"
      aria-label="Search failed"
      className="rounded-card border border-danger/30 bg-surface shadow-card"
    >
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger [&_svg]:size-7">
          <TriangleAlertIcon strokeWidth={1.75} aria-hidden="true" />
        </span>
        <h2 className="text-h3 text-ink">The search could not be completed</h2>
        <p className="max-w-md text-ink-muted">{describeError(error)}</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={onRetry} disabled={retrying}>
            <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
            Try the search again
          </Button>
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Show existing results
          </Button>
        </div>
      </div>
    </section>
  )
}

/**
 * plan.md 9.8 Search Candidates, redesigned per Enhancement.md 7: one search
 * panel (the job description, the sources, one prominent action), an AI-style
 * loading experience while the run is in progress, and a smooth hand-over to
 * the ranked results with clear empty and error states.
 */
export default function SearchCandidatesPage() {
  const [state, setState] = useUrlState(SEARCH_SPEC)
  const pageSize = useUiStore((s) => s.pageSize)
  const setPageSize = useUiStore((s) => s.setPageSize)
  const mobile = useIsMobile()
  const reducedMotion = useReducedMotion()
  const jobs = useJobList({ page_size: 100, ordering: 'title' })
  const job = useJob(state.jd || undefined)
  const runs = useSearchRuns(state.jd || undefined)
  const sources = useSources()
  const runSearch = useRunSearch()
  const invalidatePipeline = useInvalidatePipeline()
  const sourceOptions = useEnumOptions('candidate_source')
  const [selected, setSelected] = useState<string[] | null>(null)
  const [lastResponse, setLastResponse] = useState<SearchResponse | null>(null)
  const [searchError, setSearchError] = useState<unknown>(null)
  const [startedAt, setStartedAt] = useState(0)
  // A run executing in the background (202 from POST /searches/): polled until final.
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const activeRun = useSearchRun(activeRunId ?? undefined)
  const liveRun: SearchRun | null = activeRunId ? (activeRun.data ?? null) : null
  const finishedRunRef = useRef<string | null>(null)
  const [draft, setDraft] = useState(state.q)
  const debounced = useDebounce(draft, 300)
  const [selection, setSelection] = useState<RowSelectionState>({})
  const actions = useApplicationActions({ onBulkDone: () => setSelection({}) })

  const sortedJobs = useMemo(
    () =>
      [...(jobs.data?.results ?? [])].sort(
        (a, b) =>
          (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
          a.title.localeCompare(b.title),
      ),
    [jobs.data],
  )
  const allKeys = useMemo(() => (sources.data ?? []).map((source) => source.key), [sources.data])
  const chosen = selected ?? allKeys
  const chosenLabels = (sources.data ?? [])
    .filter((s) => chosen.includes(s.key))
    .map((s) => s.display_name)

  // Debounced search box -> URL once it settles.
  useEffect(() => {
    if (debounced !== state.q) setState({ q: debounced, page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  // Polling itself failed (network, sign-out): the run is not awaited any further.
  const pollError = activeRunId && activeRun.isError ? activeRun.error : null
  const inFlight = Boolean(activeRunId) && !pollError && !isRunFinished(liveRun)
  // Retrieval writes the applications before the AI evaluation starts, so the
  // table can fill in live while the last phases run.
  const partialResults =
    inFlight && (liveRun?.phase === 'evaluating' || liveRun?.phase === 'finalising')
  const list = useApplications(
    {
      job_description: state.jd,
      page: state.page,
      page_size: pageSize,
      search: state.q,
      status_group: state.group === 'all' ? undefined : state.group,
      source: state.source,
      min_match: state.min || undefined,
      ordering: state.sort,
    },
    Boolean(state.jd),
    { refetchInterval: partialResults ? 2500 : false },
  )
  const rows = list.data?.results ?? []
  const total = list.data?.count ?? 0
  const lastRun = lastResponse?.run ?? runs.data?.[0] ?? null
  const canSearch =
    Boolean(job.data?.permissions.can_work_pipeline) && isWorkable(job.data?.status ?? '')
  const searching = runSearch.isPending || inFlight
  const view = mobile ? 'cards' : state.view
  const filtered =
    state.group !== 'all' || state.source.length > 0 || state.min > 0 || state.q !== ''
  const selectedJob: JobRow | undefined = sortedJobs.find((row) => row.id === state.jd)

  function finishRun(run: SearchRun, errors: Record<string, string>) {
    setLastResponse({ run, results: [], errors })
    setSelection({})
    setState({ page: 1 })
    if (run.status === 'failed') {
      setSearchError(new Error(run.error || 'The search failed before any candidate was found.'))
      return
    }
    const unavailable = Object.keys(errors).length
      ? Object.keys(errors)
      : run.error
        ? run.error.split('; ').map((item) => item.split(':')[0])
        : []
    toast.success(
      `${run.total_found} candidates found, ${run.shortlisted} AI shortlisted` +
        (unavailable.length ? ` (${unavailable.join(', ')} unavailable)` : ''),
    )
  }

  async function search() {
    // One search at a time: the button is disabled while a run is in flight and
    // a second call is ignored (Enhancement.md 7).
    if (!state.jd || chosen.length === 0 || searching) return
    setSearchError(null)
    setStartedAt(Date.now())
    try {
      const response = await runSearch.mutateAsync({ jobId: state.jd, sources: chosen })
      if (!isRunFinished(response.run)) {
        // 202: the run continues in the background; useSearchRun polls it.
        finishedRunRef.current = null
        setActiveRunId(response.run.id)
        return
      }
      finishRun(response.run, response.errors)
    } catch (error) {
      setSearchError(error)
    }
  }

  // The background run reached its final status: refresh everything once and report.
  useEffect(() => {
    if (!activeRunId || !liveRun || !isRunFinished(liveRun)) return
    if (finishedRunRef.current === liveRun.id) return
    finishedRunRef.current = liveRun.id
    void invalidatePipeline(state.jd || undefined).then(() => {
      setActiveRunId(null)
      finishRun(liveRun, {})
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRunId, liveRun])

  function pickJob(jd: string) {
    setLastResponse(null)
    setSearchError(null)
    setSelection({})
    setActiveRunId(null)
    setState({ jd, page: 1, group: 'all', source: [], min: 0 })
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 basis-64">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
        />
        <Input
          type="search"
          aria-label="Filter results"
          placeholder="Filter results by name, company or skill…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="bg-surface pl-8"
        />
      </div>
      <Select value={state.group} onValueChange={(group) => setState({ group, page: 1 })}>
        <SelectTrigger size="sm" aria-label="Status" className="bg-surface">
          <span className="text-ink-subtle">Status:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_GROUP_OPTIONS.map((option) => (
            <SelectItem key={option.key} value={option.key}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FilterPopover
        label="Source"
        options={sourceOptions.map((option) => ({ key: option.key, label: option.label }))}
        selected={state.source}
        onChange={(source) => setState({ source, page: 1 })}
      />
      <Select
        value={String(state.min)}
        onValueChange={(min) => setState({ min: Number(min), page: 1 })}
      >
        <SelectTrigger size="sm" aria-label="Minimum match" className="bg-surface">
          <span className="text-ink-subtle">Match ≥</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MATCH_FLOOR_OPTIONS.map((floor) => (
            <SelectItem key={floor} value={String(floor)}>
              {floor === 0 ? 'Any' : `${floor}%`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-2">
        <Select value={state.sort} onValueChange={(sort) => setState({ sort, page: 1 })}>
          <SelectTrigger size="sm" aria-label="Sort" className="bg-surface">
            <span className="text-ink-subtle">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {APPLICATION_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!mobile && (
          <div
            role="radiogroup"
            aria-label="View"
            className="inline-flex h-8 items-center rounded-control border border-line bg-surface p-0.5"
          >
            {VIEW_OPTIONS.map(({ key, label, Icon }, index) => {
              const checked = state.view === key
              return (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  aria-label={`${label} view`}
                  // Roving tabindex: one tab stop, arrows move between the views.
                  tabIndex={checked ? 0 : -1}
                  onClick={() => setState({ view: key })}
                  onKeyDown={(event) => {
                    const next = rovingIndex(event.key, index, VIEW_OPTIONS.length)
                    if (next === null) return
                    event.preventDefault()
                    setState({ view: VIEW_OPTIONS[next].key })
                    focusRovingSibling(event.currentTarget.parentElement, next)
                  }}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-[4px] px-2 text-small',
                    checked ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  const fade = {
    initial: reducedMotion ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: reducedMotion ? undefined : { opacity: 0, y: -6 },
    transition: { duration: 0.35, ease: EASE_BRAND },
  }

  let results: React.ReactNode
  if (!state.jd) {
    results = (
      <motion.section key="idle" {...fade} aria-label="Results">
        <div className="rounded-card border border-dashed border-line-strong bg-surface">
          <EmptyState
            icon={UserSearchIcon}
            title="Find the right candidates"
            description="Enter a Job Description and let the system search for matching candidates. Every profile is ranked by how well it fits the role."
          />
        </div>
      </motion.section>
    )
  } else if (searching && !partialResults) {
    results = (
      <motion.section key="loading" {...fade} aria-label="Results">
        <AISearchLoader
          sources={chosenLabels}
          jobTitle={selectedJob?.title}
          startedAt={startedAt}
          phase={liveRun?.phase || (activeRunId ? 'queued' : null)}
          progress={(liveRun?.progress as SearchProgress | null) ?? null}
        />
      </motion.section>
    )
  } else if (searchError || pollError) {
    results = (
      <motion.section key="error" {...fade} aria-label="Results">
        <SearchFailed
          error={searchError ?? pollError}
          retrying={searching}
          onRetry={() => {
            setActiveRunId(null)
            void search()
          }}
          onDismiss={() => {
            setActiveRunId(null)
            setSearchError(null)
          }}
        />
      </motion.section>
    )
  } else {
    results = (
      <motion.section
        key={`results-${lastResponse?.run.id ?? 'existing'}`}
        {...fade}
        aria-label="Results"
        className="space-y-3"
      >
        {partialResults && (
          <div
            role="status"
            aria-live="polite"
            data-slot="search-live-banner"
            className="flex flex-wrap items-center gap-3 rounded-card border border-accent/60 bg-accent-soft px-4 py-3 text-small text-ink"
          >
            <SparklesIcon
              aria-hidden="true"
              className="size-4 shrink-0 animate-pulse text-accent-ink"
            />
            <span className="font-medium">
              {(liveRun?.progress as SearchProgress | null)?.message ??
                'AI evaluation in progress…'}
            </span>
            <span className="text-ink-muted">
              Candidates are listed by the rules and resume similarity; the AI explanations and
              final scores update as each review lands.
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="text-h3 text-ink">Results</h2>
          {lastResponse ? (
            <div className="flex flex-wrap items-center gap-1.5 text-small text-ink-muted">
              <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-accent-soft px-2.5 font-medium text-ink tabular-nums">
                <SparklesIcon aria-hidden="true" className="size-3.5 text-accent-ink" />
                {lastResponse.run.total_found} found
              </span>
              <span className="inline-flex h-6 items-center rounded-pill bg-surface-2 px-2.5 tabular-nums">
                {lastResponse.run.shortlisted} AI shortlisted
              </span>
              <span className="inline-flex h-6 items-center rounded-pill bg-surface-2 px-2.5 tabular-nums">
                {lastResponse.run.new_candidates} new
              </span>
              {lastResponse.run.duration_ms ? (
                <span className="text-caption text-ink-subtle tabular-nums">
                  Search took {formatDuration(lastResponse.run.duration_ms)}
                </span>
              ) : null}
            </div>
          ) : (
            <p className="text-small text-ink-muted tabular-nums">
              {total} candidates on this job description
            </p>
          )}
        </div>
        <AIBrief plan={(lastRun?.query_plan as QueryPlan | null) ?? null} />
        {list.isError ? (
          <ErrorState
            title="Couldn't load results"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : (
          <ApplicationsTable
            rows={rows}
            loading={list.isPending || list.isFetching}
            total={total}
            rankOffset={(state.page - 1) * pageSize}
            view={view}
            pagination={{
              pageIndex: state.page - 1,
              pageSize,
              onChange: ({ pageIndex, pageSize: next }) => {
                if (next !== pageSize) setPageSize(next as PageSize)
                setState({ page: pageIndex + 1 })
              },
            }}
            sorting={{
              state: state.sort
                ? [{ id: state.sort.replace(/^-/, ''), desc: state.sort.startsWith('-') }]
                : [],
              onChange: (sorting) => {
                const [first] = sorting
                setState({
                  sort: first ? `${first.desc ? '-' : ''}${first.id}` : '-match__overall_pct',
                  page: 1,
                })
              },
            }}
            selection={canSearch ? { state: selection, onChange: setSelection } : undefined}
            bulkActions={({ selectedRows }) => (
              <>
                <Button type="button" size="sm" onClick={() => actions.bulkShortlist(selectedRows)}>
                  Shortlist
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => actions.bulkEmail(selectedRows)}
                >
                  Email
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-danger"
                  onClick={() => actions.bulkReject(selectedRows)}
                >
                  Reject
                </Button>
              </>
            )}
            actionsFor={actions.itemsFor}
            toolbar={toolbar}
            emptyState={
              filtered ? (
                <EmptyState
                  icon={SearchXIcon}
                  title="No candidates match these filters"
                  description="Try a different filter, or clear them to see everyone on this job description."
                  action={
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDraft('')
                        setState({ q: '', group: 'all', source: [], min: 0, page: 1 })
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={SearchXIcon}
                  title="No matching candidates found"
                  description="Try adjusting the Job Description or search requirements, or add another source and search again."
                  action={
                    canSearch ? (
                      <Button type="button" variant="outline" onClick={() => void search()}>
                        <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                        Search again
                      </Button>
                    ) : undefined
                  }
                />
              )
            }
          />
        )}
      </motion.section>
    )
  }

  return (
    <>
      <PageHeader
        title="Search Candidates"
        subtitle="Describe the role, choose where to look, and let the AI recruiter rank every profile by fit."
        breadcrumbs={[{ label: 'Search Candidates' }]}
      />

      <div className="space-y-5">
        <section
          aria-labelledby="search-panel-heading"
          data-slot="search-panel"
          className="relative overflow-hidden rounded-card border border-line bg-surface shadow-card"
        >
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-accent" />
          <div className="grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
            {/* Step 1: the job description */}
            <div className="min-w-0 space-y-4">
              <div className="flex items-start gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-card bg-ink text-accent">
                  <SparklesIcon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <h2 id="search-panel-heading" className="text-h3 text-ink">
                    What are you hiring for?
                  </h2>
                  <p className="mt-0.5 text-small text-ink-muted">
                    Pick a job description. Its skills, experience range and domain become the
                    search brief.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <StepLabel step={1}>Job description</StepLabel>
                {jobs.isError ? (
                  <ErrorState
                    variant="inline"
                    title="Couldn't load job descriptions"
                    error={jobs.error}
                    onRetry={() => void jobs.refetch()}
                  />
                ) : jobs.isPending ? (
                  <SkeletonText lines={2} className="py-1" />
                ) : (
                  <Select value={state.jd} onValueChange={pickJob}>
                    <SelectTrigger
                      aria-label="Job description"
                      className="h-11 w-full bg-surface text-[15px] data-placeholder:text-ink-muted"
                    >
                      <SelectValue placeholder="Choose the role you are hiring for" />
                    </SelectTrigger>
                    <SelectContent>
                      {sortedJobs.map((row) => (
                        <SelectItem key={row.id} value={row.id}>
                          {row.title}
                          <span className="text-ink-subtle"> · {row.department}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedJob ? (
                  <div className="min-w-0 space-y-2 rounded-card border border-line bg-surface-2/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/jobs/${selectedJob.id}`}
                        className="font-medium text-ink hover:underline"
                      >
                        {selectedJob.title}
                      </Link>
                      <StatusBadge status={selectedJob.status} kind="jd_status" dot />
                    </div>
                    <p className="text-small text-ink-muted">{jobSummaryLine(selectedJob)}</p>
                    <SkillChips
                      skills={skillChips(
                        selectedJob.required_skills,
                        selectedJob.required_skill_names,
                      )}
                      max={8}
                    />
                    {lastRun ? (
                      <p className="inline-flex flex-wrap items-center gap-1.5 text-caption text-ink-subtle">
                        <span>Last search {formatDateTime(lastRun.started_at)}</span>
                        {lastRun.requested_by && (
                          <>
                            <span>by</span>
                            <UserChip user={personFromUser(lastRun.requested_by)} />
                          </>
                        )}
                        <span>
                          · {lastRun.total_found} found, {lastRun.shortlisted} AI shortlisted
                        </span>
                      </p>
                    ) : runs.isError ? (
                      <ErrorState
                        variant="inline"
                        title="Couldn't load the search history"
                        error={runs.error}
                        onRetry={() => void runs.refetch()}
                      />
                    ) : runs.isPending ? (
                      <Skeleton
                        aria-busy="true"
                        aria-label="Checking search history"
                        className="h-3.5 w-72 max-w-full bg-surface-3"
                      />
                    ) : (
                      <p className="text-caption text-ink-subtle">
                        No searches yet for this job description.
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-small text-ink-subtle">
                    Open roles are listed first. The search reads the job description for you.
                  </p>
                )}
                {job.isError && (
                  <ErrorState
                    variant="inline"
                    title="Couldn't load this job description"
                    error={job.error}
                    onRetry={() => void job.refetch()}
                  />
                )}
              </div>
            </div>

            {/* Step 2: sources and the action */}
            <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:border-line lg:pl-8">
              <div className="space-y-3">
                <StepLabel step={2}>Where to look</StepLabel>
                {sources.isError ? (
                  <ErrorState
                    variant="inline"
                    title="Couldn't load sources"
                    error={sources.error}
                    onRetry={() => void sources.refetch()}
                  />
                ) : (
                  <div aria-busy={sources.isPending || undefined} className="flex flex-wrap gap-3">
                    {(sources.data ?? []).map((source) => {
                      const Icon = SOURCE_ICONS[source.key] ?? DatabaseIcon
                      const on = chosen.includes(source.key)
                      return (
                        <button
                          key={source.key}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          disabled={!source.available || searching}
                          onClick={() =>
                            setSelected(
                              on
                                ? chosen.filter((key) => key !== source.key)
                                : [...chosen, source.key],
                            )
                          }
                          className={cn(
                            'inline-flex items-center gap-3 rounded-card border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow,transform] duration-150 ease-brand',
                            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                            SOURCE_TILE,
                            on
                              ? 'border-ink bg-ink text-white shadow-card'
                              : 'border-line bg-surface text-ink hover:-translate-y-px hover:border-line-strong hover:shadow-card',
                            !source.available && 'opacity-50',
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex size-8 shrink-0 items-center justify-center rounded-full',
                              on ? 'bg-accent text-ink' : 'bg-surface-2 text-ink-muted',
                            )}
                          >
                            {on ? (
                              <CheckIcon aria-hidden="true" className="size-4" strokeWidth={2.5} />
                            ) : (
                              <Icon aria-hidden="true" className="size-4" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-[13px] font-medium">
                              {source.display_name}
                            </span>
                            <span
                              className={cn(
                                'block text-caption tabular-nums',
                                on ? 'text-white/70' : 'text-ink-subtle',
                              )}
                            >
                              {source.available
                                ? `${source.profile_count} profiles`
                                : 'Unavailable'}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                    {sources.isPending && (
                      <>
                        <span role="status" className="sr-only">
                          Checking sources…
                        </span>
                        {Array.from({ length: 4 }, (_, index) => (
                          <Skeleton
                            key={index}
                            data-testid="skeleton-source"
                            className={cn(
                              'rounded-card bg-surface-3',
                              SOURCE_TILE,
                              SOURCE_TILE_HEIGHT,
                            )}
                          />
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-auto space-y-3 border-t border-line pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => void search()}
                    disabled={!state.jd || !canSearch || chosen.length === 0 || searching}
                    aria-busy={searching || undefined}
                    className="h-11 min-w-48 px-5 text-[14px] max-sm:w-full"
                  >
                    <SparklesIcon data-icon="inline-start" aria-hidden="true" />
                    {searching ? 'Searching…' : 'Search candidates'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setSelected(null)}
                    disabled={chosen.length === allKeys.length || searching}
                  >
                    Use all sources
                  </Button>
                </div>
                <p className="text-caption text-ink-subtle">
                  {!state.jd
                    ? 'Choose a job description to enable the search.'
                    : !canSearch && job.isSuccess
                      ? isWorkable(job.data.status)
                        ? 'You can view results here, but only people involved in this recruitment can run a search.'
                        : 'This job description is closed, so no new searches can be run.'
                      : chosen.length === 0
                        ? 'Pick at least one source.'
                        : `Searches ${chosenLabels.length === allKeys.length ? 'every source' : chosenLabels.join(', ')}; the AI recruiter reads the brief, scans the profiles and ranks them by fit.`}
                </p>
              </div>
            </div>
          </div>
        </section>

        <AnimatePresence mode="wait" initial={false}>
          {results}
        </AnimatePresence>
      </div>
      {actions.dialogs}
    </>
  )
}
