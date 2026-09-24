import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import type { ColumnDef } from '@tanstack/react-table'
import { LockIcon, PlusIcon, SearchIcon, SearchXIcon, UploadIcon, UsersIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router'
import { ClearFiltersButton } from '@/components/shared/ClearFiltersButton'
import { Avatar } from '@/components/shared/Avatar'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FilterPopover } from '@/components/shared/FilterPopover'
import { PageHeader } from '@/components/shared/PageHeader'
import { SkillChips } from '@/components/shared/SkillChips'
import { SourceBadge } from '@/components/shared/SourceBadge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatYears } from '@/features/applications/application-utils'
import { AddCandidateDialog } from '@/features/candidates/AddCandidateDialog'
import { useCandidates } from '@/features/candidates/api'
import {
  CANDIDATE_SORT_OPTIONS,
  candidateRowHref,
  EXPERIENCE_BANDS,
  isMasked,
  type ExperienceBandKey,
} from '@/features/candidates/candidate-utils'
import { useJobList } from '@/features/jobs/api'
import { useAuthStore } from '@/lib/auth-store'
import { useEnumOptions } from '@/lib/enums'
import { formatDateTime, formatRelative } from '@/lib/format'
import { param, useDebounce, useUrlState } from '@/lib/hooks'
import { useUiStore, type PageSize } from '@/lib/ui-store'
import type { CandidateRow } from '@/types/domain'

const BAND_KEYS = EXPERIENCE_BANDS.map((band) => band.key)

const LIST_SPEC = {
  q: param.string(''),
  source: param.list<string>([]),
  status: param.list<string>([]),
  exp: param.enum<ExperienceBandKey>('any', BAND_KEYS),
  jd: param.string(''),
  sort: param.string('-last_activity'),
  page: param.number(1),
}

const ANY_JOB = '__any__'
const MAX_BADGES = 2

/** plan.md 9.9 Candidates list. */
export default function CandidateListPage() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const pageSize = useUiStore((state) => state.pageSize)
  const setPageSize = useUiStore((state) => state.setPageSize)
  const [state, setState] = useUrlState(LIST_SPEC)
  const [draft, setDraft] = useState(state.q)
  const debounced = useDebounce(draft, 300)
  // The debounced search box lands in the URL once it settles (plan.md 7.1).
  useEffect(() => {
    if (debounced !== state.q) setState({ q: debounced, page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
  const [adding, setAdding] = useState(false)
  const sources = useEnumOptions('candidate_source')
  const statuses = useEnumOptions('application_status')
  const jobs = useJobList({ page_size: 100, ordering: 'title' })
  const band = EXPERIENCE_BANDS.find((entry) => entry.key === state.exp) ?? EXPERIENCE_BANDS[0]
  const canAdd = user?.role === 'hr_admin' || user?.role === 'hr'

  const list = useCandidates({
    page: state.page,
    page_size: pageSize,
    search: state.q,
    source: state.source,
    status: state.status,
    min_exp: band.min,
    max_exp: band.max,
    job_description: state.jd || undefined,
    ordering: state.sort,
  })
  const rows = list.data?.results ?? []
  const total = list.data?.count ?? 0
  const filtered = Boolean(
    state.q || state.source.length || state.status.length || state.exp !== 'any' || state.jd,
  )

  const columns = useMemo<ColumnDef<CandidateRow, unknown>[]>(
    () => [
      {
        id: 'full_name',
        header: 'Candidate',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={row.original.full_name} src={row.original.avatar_url} size="md" />
            <div className="min-w-0">
              <span className="block truncate font-medium text-ink">{row.original.full_name}</span>
              <span className="block truncate text-caption text-ink-subtle">
                {row.original.headline}
              </span>
            </div>
          </div>
        ),
      },
      {
        id: 'skills',
        header: 'Skills',
        enableSorting: false,
        meta: { className: 'min-w-56' },
        cell: ({ row }) => (
          <SkillChips
            skills={row.original.skills.map((skill) => ({
              name: skill.display_name,
              proficiency: skill.proficiency,
            }))}
            max={4}
          />
        ),
      },
      {
        id: 'total_experience_years',
        header: 'Experience',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatYears(row.original.total_experience_years)}</span>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        enableSorting: true,
        cell: ({ row }) => <span className="text-ink-muted">{row.original.location || '—'}</span>,
      },
      {
        id: 'sources',
        header: 'Sources',
        enableSorting: false,
        cell: ({ row }) => <SourceBadge source={row.original.sources} />,
      },
      {
        id: 'applications',
        header: 'Active applications',
        enableSorting: false,
        cell: ({ row }) => {
          const apps = row.original.applications
          if (apps.length === 0) return <span className="text-caption text-ink-subtle">None</span>
          const shown = apps.slice(0, MAX_BADGES)
          return (
            <div className="flex flex-wrap items-center gap-1">
              {shown.map((application) => (
                <Tooltip key={application.id}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <StatusBadge status={application.status} dot />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{application.job.title}</TooltipContent>
                </Tooltip>
              ))}
              {apps.length > MAX_BADGES && (
                <span className="text-caption text-ink-subtle tabular-nums">
                  +{apps.length - MAX_BADGES}
                </span>
              )}
            </div>
          )
        },
      },
      {
        id: 'last_activity',
        header: 'Last activity',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) =>
          row.original.last_activity_at ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-ink-muted">
                  {formatRelative(row.original.last_activity_at)}
                </span>
              </TooltipTrigger>
              <TooltipContent>{formatDateTime(row.original.last_activity_at)}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-caption text-ink-subtle">—</span>
          ),
      },
    ],
    [],
  )

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 basis-56">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
        />
        <Input
          type="search"
          aria-label="Search candidates"
          placeholder="Search by name, company, location or skill…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="bg-surface pl-8"
        />
      </div>
      <FilterPopover
        label="Source"
        options={sources.map((o) => ({ key: o.key, label: o.label }))}
        selected={state.source}
        onChange={(source) => setState({ source, page: 1 })}
      />
      <FilterPopover
        label="Status"
        options={statuses.map((o) => ({ key: o.key, label: o.label }))}
        selected={state.status}
        onChange={(status) => setState({ status, page: 1 })}
        searchable
      />
      <Select
        value={state.exp}
        onValueChange={(exp) => setState({ exp: exp as ExperienceBandKey, page: 1 })}
      >
        <SelectTrigger size="sm" aria-label="Experience" className="bg-surface">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {EXPERIENCE_BANDS.map((entry) => (
            <SelectItem key={entry.key} value={entry.key}>
              {entry.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={state.jd || ANY_JOB}
        onValueChange={(jd) => setState({ jd: jd === ANY_JOB ? '' : jd, page: 1 })}
      >
        <SelectTrigger
          size="sm"
          aria-label="Job description"
          className="max-w-56 bg-surface"
          disabled={jobs.isError}
          title={
            jobs.isError
              ? 'Job descriptions could not be loaded, so filtering by job is unavailable.'
              : undefined
          }
        >
          <SelectValue placeholder="Any job description" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_JOB}>Any job description</SelectItem>
          {(jobs.data?.results ?? []).map((row) => (
            <SelectItem key={row.id} value={row.id}>
              {row.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="ml-auto flex items-center gap-2">
        <ClearFiltersButton
          active={filtered}
          onClick={() => {
            setDraft('')
            setState({ q: '', source: [], status: [], exp: 'any', jd: '', page: 1 })
          }}
        />
        <Select value={state.sort} onValueChange={(sort) => setState({ sort, page: 1 })}>
          <SelectTrigger size="sm" aria-label="Sort" className="bg-surface">
            <span className="text-ink-subtle">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {CANDIDATE_SORT_OPTIONS.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  const masked = rows.some((row) => isMasked(row.email))

  return (
    <>
      <PageHeader
        title="Candidates"
        subtitle={
          masked ? (
            <span className="inline-flex items-center gap-1.5">
              <LockIcon aria-hidden="true" className="size-3.5" />
              Contact details are hidden for your role.
            </span>
          ) : (
            'A world of experience, skills and potential. Find the person behind every profile.'
          )
        }
        breadcrumbs={[{ label: 'Candidates' }]}
        actions={
          canAdd ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <Link to="/candidates/upload">
                  <UploadIcon data-icon="inline-start" aria-hidden="true" />
                  Upload resumes
                </Link>
              </Button>
              <Button type="button" onClick={() => setAdding(true)}>
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                Add candidate
              </Button>
            </div>
          ) : undefined
        }
      />
      <section
        aria-label="Candidate directory overview"
        className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-surface p-5 shadow-card"
      >
        <div className="flex items-center gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
            <UsersIcon aria-hidden="true" className="size-6" strokeWidth={1.5} />
          </span>
          <div>
            <h2 className="text-h3">Your talent network</h2>
            <p className="mt-1 text-small text-ink-subtle">
              {filtered
                ? 'Showing profiles that match your current filters.'
                : 'Every profile is the beginning of a new possibility.'}
            </p>
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-[32px] font-semibold tracking-tight text-primary">
            {list.isPending || list.isError ? '—' : <AnimatedNumber value={total} />}
          </span>
          <span className="text-small text-ink-subtle">
            {filtered ? 'matching profiles' : 'candidate profiles'}
          </span>
        </div>
      </section>
      {list.isError ? (
        <div className="space-y-4">
          {toolbar}
          <ErrorState
            title="Couldn't load candidates"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        </div>
      ) : (
        <DataTable<CandidateRow>
          aria-label="Candidates"
          columns={columns}
          data={rows}
          loading={list.isPending || list.isFetching}
          getRowId={(row) => row.id}
          sorting={{
            state: state.sort
              ? [{ id: state.sort.replace(/^-/, ''), desc: state.sort.startsWith('-') }]
              : [],
            onChange: (sorting) => {
              const [first] = sorting
              setState({
                sort: first ? `${first.desc ? '-' : ''}${first.id}` : '-last_activity',
                page: 1,
              })
            },
          }}
          total={total}
          pagination={{
            pageIndex: state.page - 1,
            pageSize,
            onChange: ({ pageIndex, pageSize: next }) => {
              if (next !== pageSize) setPageSize(next as PageSize)
              setState({ page: pageIndex + 1 })
            },
          }}
          onRowClick={(row) => navigate(candidateRowHref(row))}
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
                      setState({ q: '', source: [], status: [], exp: 'any', jd: '', page: 1 })
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={UsersIcon}
                title="No candidates yet"
                description="Run a search on a job description or add someone by hand."
              />
            )
          }
        />
      )}
      <AddCandidateDialog open={adding} onOpenChange={setAdding} />
    </>
  )
}
