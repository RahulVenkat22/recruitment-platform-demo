import type { RowSelectionState } from '@tanstack/react-table'
import {
  BriefcaseIcon,
  CheckIcon,
  DatabaseIcon,
  LayoutGridIcon,
  LinkIcon,
  ListIcon,
  Loader2Icon,
  MailIcon,
  SearchIcon,
  SearchXIcon,
  SparklesIcon,
  UserSearchIcon,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FilterPopover } from '@/components/shared/FilterPopover'
import { PageHeader } from '@/components/shared/PageHeader'
import { SkeletonText } from '@/components/shared/Skeletons'
import { SkillChips } from '@/components/shared/SkillChips'
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
  useApplications,
  useRunSearch,
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
import { jobSummaryLine, skillChips } from '@/features/jobs/job-utils'
import { useEnumOptions } from '@/lib/enums'
import { describeError } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { useDebounce, useIsMobile, usePrefersReducedMotion, param, useUrlState } from '@/lib/hooks'
import { focusRovingSibling, rovingIndex } from '@/lib/keyboard'
import { useUiStore, type PageSize } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { personFromUser, type JobRow, type SearchResponse } from '@/types/domain'

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
}

const STATUS_RANK: Record<string, number> = {
  open: 0,
  on_hold: 1,
  draft: 2,
  closed: 3,
  archived: 4,
}

const VIEW_OPTIONS = [
  { key: 'table', label: 'Table', Icon: ListIcon },
  { key: 'cards', label: 'Cards', Icon: LayoutGridIcon },
] as const

/** Source tiles sit four across on desktop and two across on phones. */
const SOURCE_TILE = 'min-w-44 max-sm:min-w-0 max-sm:basis-[calc(50%-0.375rem)]'
const SOURCE_TILE_HEIGHT = 'h-[54px]'

function StepCard({
  step,
  title,
  children,
}: {
  step: number
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={`search-step-${step}`}
      className="rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <h2
        id={`search-step-${step}`}
        className="mb-3 flex items-center gap-2 text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase"
      >
        <span className="inline-flex size-5 items-center justify-center rounded-full bg-primary-soft text-[11px] text-primary tabular-nums">
          {step}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

/** plan.md 9.8 Search Candidates: pick a JD, pick sources, run the search, work the ranked results. */
export default function SearchCandidatesPage() {
  const [state, setState] = useUrlState(SEARCH_SPEC)
  const pageSize = useUiStore((s) => s.pageSize)
  const setPageSize = useUiStore((s) => s.setPageSize)
  const mobile = useIsMobile()
  const reducedMotion = usePrefersReducedMotion()
  const jobs = useJobList({ page_size: 100, ordering: 'title' })
  const job = useJob(state.jd || undefined)
  const runs = useSearchRuns(state.jd || undefined)
  const sources = useSources()
  const runSearch = useRunSearch()
  const sourceOptions = useEnumOptions('candidate_source')
  const [selected, setSelected] = useState<string[] | null>(null)
  const [lastResponse, setLastResponse] = useState<SearchResponse | null>(null)
  const [progressIndex, setProgressIndex] = useState(0)
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

  // "Searching Naukri… LinkedIn…" while the request runs (plan.md 9.8). Under
  // prefers-reduced-motion the label stays put instead of cycling.
  useEffect(() => {
    if (!runSearch.isPending || reducedMotion) return
    const handle = window.setInterval(() => setProgressIndex((index) => index + 1), 700)
    return () => window.clearInterval(handle)
  }, [runSearch.isPending, reducedMotion])
  const searchingLabel =
    reducedMotion || chosenLabels.length === 0
      ? 'Searching…'
      : `Searching ${chosenLabels[progressIndex % chosenLabels.length]}…`

  // Debounced search box -> URL once it settles.
  useEffect(() => {
    if (debounced !== state.q) setState({ q: debounced, page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

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
  )
  const rows = list.data?.results ?? []
  const total = list.data?.count ?? 0
  const lastRun = lastResponse?.run ?? runs.data?.[0] ?? null
  const canSearch =
    Boolean(job.data?.permissions.can_work_pipeline) && job.data?.status !== 'archived'
  const view = mobile ? 'cards' : state.view
  const filtered =
    state.group !== 'all' || state.source.length > 0 || state.min > 0 || state.q !== ''

  async function search() {
    if (!state.jd || chosen.length === 0) return
    setProgressIndex(0)
    try {
      const response = await runSearch.mutateAsync({ jobId: state.jd, sources: chosen })
      setLastResponse(response)
      setSelection({})
      setState({ page: 1 })
      toast.success(
        `${response.run.total_found} candidates found, ${response.run.shortlisted} AI shortlisted` +
          (Object.keys(response.errors).length
            ? ` (${Object.keys(response.errors).join(', ')} unavailable)`
            : ''),
      )
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  const selectedJob: JobRow | undefined = sortedJobs.find((row) => row.id === state.jd)

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
          placeholder="Filter results…"
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

  return (
    <>
      <PageHeader
        title="Search Candidates"
        subtitle="Pick a job description and the sources to search; results are ranked by AI match."
        breadcrumbs={[{ label: 'Search Candidates' }]}
      />

      <div className="space-y-4">
        <StepCard step={1} title="Selected Job Description">
          {jobs.isError ? (
            <ErrorState
              variant="inline"
              title="Couldn't load job descriptions"
              error={jobs.error}
              onRetry={() => void jobs.refetch()}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start">
              {jobs.isPending ? (
                <SkeletonText lines={2} className="py-1" />
              ) : (
                <Select
                  value={state.jd}
                  onValueChange={(jd) => {
                    setLastResponse(null)
                    setSelection({})
                    setState({ jd, page: 1, group: 'all', source: [], min: 0 })
                  }}
                >
                  <SelectTrigger aria-label="Job description" className="w-full">
                    <SelectValue placeholder="Choose a job description" />
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
                <div className="min-w-0 space-y-2">
                  <p className="text-small text-ink-muted">
                    <Link
                      to={`/jobs/${selectedJob.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {selectedJob.title}
                    </Link>{' '}
                    • {jobSummaryLine(selectedJob)}
                  </p>
                  <SkillChips
                    skills={skillChips(
                      selectedJob.required_skills,
                      selectedJob.required_skill_names,
                    )}
                    max={8}
                  />
                  {lastRun ? (
                    <p className="inline-flex flex-wrap items-center gap-1.5 text-caption text-ink-subtle">
                      <span>Last search: {formatDateTime(lastRun.started_at)}</span>
                      {lastRun.requested_by && (
                        <>
                          <span>by</span>
                          <UserChip user={personFromUser(lastRun.requested_by)} />
                        </>
                      )}
                      <span>
                        ({lastRun.total_found} found, {lastRun.shortlisted} AI shortlisted)
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
                <p className="text-small text-ink-muted">
                  Choose the role you are hiring for. Open roles are listed first.
                </p>
              )}
            </div>
          )}
          {job.isError && (
            <ErrorState
              variant="inline"
              className="mt-3"
              title="Couldn't load this job description"
              error={job.error}
              onRetry={() => void job.refetch()}
            />
          )}
        </StepCard>

        <StepCard step={2} title="Candidate sources">
          {sources.isError ? (
            <ErrorState
              variant="inline"
              title="Couldn't load sources"
              error={sources.error}
              onRetry={() => void sources.refetch()}
            />
          ) : (
            <div
              aria-busy={sources.isPending || undefined}
              className="flex flex-wrap items-center gap-3"
            >
              {(sources.data ?? []).map((source) => {
                const Icon = SOURCE_ICONS[source.key] ?? DatabaseIcon
                const on = chosen.includes(source.key)
                return (
                  <button
                    key={source.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={!source.available}
                    onClick={() =>
                      setSelected(
                        on ? chosen.filter((key) => key !== source.key) : [...chosen, source.key],
                      )
                    }
                    className={cn(
                      'inline-flex items-center gap-3 rounded-card border px-3 py-2.5 text-left transition-colors duration-150 ease-brand',
                      SOURCE_TILE,
                      on
                        ? 'border-primary/50 bg-primary-soft'
                        : 'border-line bg-surface hover:border-line-strong',
                      !source.available && 'opacity-50',
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex size-8 items-center justify-center rounded-full',
                        on ? 'bg-primary text-white' : 'bg-surface-2 text-ink-muted',
                      )}
                    >
                      {on ? (
                        <CheckIcon aria-hidden="true" className="size-4" />
                      ) : (
                        <Icon aria-hidden="true" className="size-4" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-ink">
                        {source.display_name}
                      </span>
                      <span className="block text-caption text-ink-subtle tabular-nums">
                        {source.available ? `${source.profile_count} profiles` : 'Unavailable'}
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
                      className={cn('rounded-card bg-surface-3', SOURCE_TILE, SOURCE_TILE_HEIGHT)}
                    />
                  ))}
                </>
              )}
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected(null)}
                  disabled={chosen.length === allKeys.length}
                >
                  Search All Sources
                </Button>
                <Button
                  type="button"
                  onClick={() => void search()}
                  disabled={!state.jd || !canSearch || chosen.length === 0 || runSearch.isPending}
                  className="min-w-32"
                >
                  {runSearch.isPending ? (
                    <>
                      <Loader2Icon aria-hidden="true" className="animate-spin" />
                      {searchingLabel}
                    </>
                  ) : (
                    <>
                      <SparklesIcon data-icon="inline-start" aria-hidden="true" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
          {state.jd && job.isSuccess && !canSearch && (
            <p className="mt-3 text-small text-ink-muted">
              You can view results here, but only people involved in this recruitment can run a
              search.
            </p>
          )}
        </StepCard>

        {!state.jd ? (
          <section aria-label="Results" className="rounded-card border border-line bg-surface">
            <EmptyState
              icon={UserSearchIcon}
              title="Choose a job description to start"
              description="Pick the role in step 1 and the sources to search in step 2; candidates ranked by AI match appear here."
            />
          </section>
        ) : (
          <section aria-label="Results" className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-h3 text-ink">Results</h2>
              {lastResponse ? (
                <p className="text-small text-ink-muted tabular-nums">
                  {lastResponse.run.total_found} candidates • {lastResponse.run.shortlisted} AI
                  shortlisted • {lastResponse.run.new_candidates} new
                </p>
              ) : (
                <p className="text-small text-ink-muted tabular-nums">
                  {total} candidates on this job description
                </p>
              )}
            </div>
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
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => actions.bulkShortlist(selectedRows)}
                    >
                      Shortlist
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
                      title="No candidates matched"
                      description="Try adding Naukri or LinkedIn, or widen the experience range on the job description."
                    />
                  )
                }
              />
            )}
          </section>
        )}
      </div>
      {actions.dialogs}
    </>
  )
}
