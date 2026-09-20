import type { RowSelectionState } from '@tanstack/react-table'
import { SearchIcon, SearchXIcon, UserSearchIcon, UsersIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FilterChips } from '@/components/shared/FilterChips'
import { FilterPopover } from '@/components/shared/FilterPopover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useApplications } from '@/features/applications/api'
import {
  APPLICATION_SORT_OPTIONS,
  STATUS_GROUP_OPTIONS,
} from '@/features/applications/application-utils'
import { ApplicationsTable } from '@/features/applications/ApplicationsTable'
import { useApplicationActions } from '@/features/applications/useApplicationActions'
import { ViewToggle } from '@/features/jobs/ViewToggle'
import { useEnumOptions } from '@/lib/enums'
import { useDebounce, useIsMobile, param, useUrlState } from '@/lib/hooks'
import { useUiStore, type PageSize } from '@/lib/ui-store'
import type { JobDetail } from '@/types/domain'

const CANDIDATES_SPEC = {
  cgroup: param.string('all'),
  cq: param.string(''),
  csource: param.list<string>([]),
  csort: param.string('-match__overall_pct'),
  cpage: param.number(1),
  cview: param.enum<'table' | 'cards'>('table', ['table', 'cards']),
}

/** plan.md 9.6 Candidates tab: the ranked table scoped to this JD with group chips and bulk actions. */
export function CandidatesTab({ job }: { job: JobDetail }) {
  const [state, setState] = useUrlState(CANDIDATES_SPEC)
  const pageSize = useUiStore((s) => s.pageSize)
  const setPageSize = useUiStore((s) => s.setPageSize)
  const mobile = useIsMobile()
  const [draft, setDraft] = useState(state.cq)
  const [syncedQ, setSyncedQ] = useState(state.cq)
  if (state.cq !== syncedQ) {
    setSyncedQ(state.cq)
    if (state.cq === '') setDraft('')
  }
  const debounced = useDebounce(draft, 300)
  const [selection, setSelection] = useState<RowSelectionState>({})
  const sources = useEnumOptions('candidate_source')
  const actions = useApplicationActions({ onBulkDone: () => setSelection({}) })

  const list = useApplications({
    job_description: job.id,
    page: state.cpage,
    page_size: pageSize,
    search: debounced,
    status_group: state.cgroup === 'all' ? undefined : state.cgroup,
    source: state.csource,
    ordering: state.csort,
  })
  const rows = list.data?.results ?? []
  const total = list.data?.count ?? 0
  const filtered = state.cgroup !== 'all' || state.csource.length > 0 || debounced.trim() !== ''
  const view = mobile ? 'cards' : state.cview
  const canWork = job.permissions.can_work_pipeline

  const toolbar = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          aria-label="Status groups"
          options={STATUS_GROUP_OPTIONS.map((option) => ({ key: option.key, label: option.label }))}
          selected={[state.cgroup]}
          onChange={(next) => {
            const chosen = next.find((key) => key !== state.cgroup) ?? 'all'
            setState({ cgroup: chosen, cpage: 1 })
          }}
        />
        {canWork && job.status !== 'archived' && (
          <Button asChild variant="outline" size="sm" className="ml-auto">
            <Link to={`/search?jd=${job.id}`}>
              <UserSearchIcon data-icon="inline-start" aria-hidden="true" />
              Run new search
            </Link>
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            aria-label="Filter candidates"
            placeholder="Filter by name, company or skill…"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              if (state.cpage !== 1) setState({ cpage: 1 })
            }}
            className="bg-surface pl-8"
          />
        </div>
        <FilterPopover
          label="Source"
          options={sources.map((option) => ({ key: option.key, label: option.label }))}
          selected={state.csource}
          onChange={(csource) => setState({ csource, cpage: 1 })}
        />
        <Select value={state.csort} onValueChange={(csort) => setState({ csort, cpage: 1 })}>
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
        {!mobile && <ViewToggle view={state.cview} onChange={(cview) => setState({ cview })} />}
      </div>
    </div>
  )

  useDebouncedUrlSync(debounced, state.cq, (cq) => setState({ cq, cpage: 1 }))

  if (list.isError) {
    return (
      <div className="space-y-4">
        {toolbar}
        <ErrorState
          title="Couldn't load candidates"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      </div>
    )
  }

  const emptyState = filtered ? (
    <EmptyState
      icon={SearchXIcon}
      title="No candidates match these filters"
      action={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraft('')
            setState({ cgroup: 'all', csource: [], cq: '', cpage: 1 })
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
      description="Run a search across the candidate sources to fill this pipeline."
      action={
        canWork ? (
          <Button asChild>
            <Link to={`/search?jd=${job.id}`}>Search candidates</Link>
          </Button>
        ) : undefined
      }
    />
  )

  return (
    <>
      <ApplicationsTable
        rows={rows}
        loading={list.isPending || list.isFetching}
        total={total}
        rankOffset={(state.cpage - 1) * pageSize}
        view={view}
        pagination={{
          pageIndex: state.cpage - 1,
          pageSize,
          onChange: ({ pageIndex, pageSize: next }) => {
            if (next !== pageSize) setPageSize(next as PageSize)
            setState({ cpage: pageIndex + 1 })
          },
        }}
        sorting={{
          state: sortingFrom(state.csort),
          onChange: (sorting) => setState({ csort: sortingTo(sorting), cpage: 1 }),
        }}
        selection={canWork ? { state: selection, onChange: setSelection } : undefined}
        bulkActions={({ selectedRows }) => (
          <>
            <Button type="button" size="sm" onClick={() => actions.bulkShortlist(selectedRows)}>
              Shortlist selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => actions.bulkEmail(selectedRows)}
            >
              Email selected
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-danger"
              onClick={() => actions.bulkReject(selectedRows)}
            >
              Reject selected
            </Button>
          </>
        )}
        actionsFor={actions.itemsFor}
        toolbar={toolbar}
        emptyState={emptyState}
      />
      {actions.dialogs}
    </>
  )
}

function sortingFrom(sort: string) {
  if (!sort) return []
  const desc = sort.startsWith('-')
  return [{ id: desc ? sort.slice(1) : sort, desc }]
}

function sortingTo(sorting: { id: string; desc: boolean }[]): string {
  const [first] = sorting
  if (!first) return '-match__overall_pct'
  return `${first.desc ? '-' : ''}${first.id}`
}

/** Pushes the debounced search box into the URL once it settles. */
function useDebouncedUrlSync(debounced: string, current: string, write: (value: string) => void) {
  useEffect(() => {
    if (debounced !== current) write(debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])
}
