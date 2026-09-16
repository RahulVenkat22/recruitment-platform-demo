import { SearchIcon, SearchXIcon, UserSearchIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FilterPopover } from '@/components/shared/FilterPopover'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useApplicationActions } from '@/features/applications/useApplicationActions'
import { useKanban } from '@/features/jobs/api'
import { AddExistingCandidateDialog } from '@/features/kanban/AddExistingCandidateDialog'
import { KanbanBoard } from '@/features/kanban/KanbanBoard'
import { isWorkable } from '@/features/jobs/job-utils'
import { MATCH_FLOORS } from '@/features/kanban/kanban-utils'
import { useEnumOptions } from '@/lib/enums'
import { param, useDebounce, useIsMobile, useUrlState } from '@/lib/hooks'
import type { JobDetail } from '@/types/domain'

const SPEC = {
  kq: param.string(''),
  ksource: param.list<string>([]),
  kmin: param.number(0),
  kowner: param.string(''),
  kcol: param.string(''),
}

/** plan.md 9.7 Kanban tab: filters above the board, a column switcher on phones. */
export function KanbanTab({ job }: { job: JobDetail }) {
  const [state, setState] = useUrlState(SPEC)
  const [draft, setDraft] = useState(state.kq)
  const debounced = useDebounce(draft, 300)
  const mobile = useIsMobile()
  const sources = useEnumOptions('candidate_source')
  const actions = useApplicationActions()
  const [addOpen, setAddOpen] = useState(false)
  const board = useKanban(job.id, {
    search: debounced,
    source: state.ksource,
    min_match: state.kmin || undefined,
    owner: state.kowner || undefined,
  })
  const filtered = Boolean(debounced || state.ksource.length || state.kmin || state.kowner)

  // Push the settled search into the URL so the filtered board stays linkable (plan.md 7.1).
  useEffect(() => {
    if (debounced !== state.kq) setState({ kq: debounced })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  function clearFilters() {
    setDraft('')
    setState({ kq: '', ksource: [], kmin: 0, kowner: '' })
  }
  const owners = useMemo(() => {
    const people = new Map<string, { id: string; name: string }>()
    for (const column of board.data ? [...board.data.columns, board.data.tray] : []) {
      for (const card of column.cards)
        if (card.owner) people.set(card.owner.id, { id: card.owner.id, name: card.owner.full_name })
    }
    for (const participant of job.participants) {
      if (participant.user.role === 'hr' || participant.user.role === 'hr_admin') {
        people.set(participant.user.id, {
          id: participant.user.id,
          name: participant.user.full_name,
        })
      }
    }
    return [...people.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [board.data, job.participants])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            aria-label="Search candidates on the board"
            placeholder="Search candidates…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="bg-surface pl-8"
          />
        </div>
        <FilterPopover
          label="Source"
          options={sources.map((option) => ({ key: option.key, label: option.label }))}
          selected={state.ksource}
          onChange={(next) => setState({ ksource: next })}
        />
        <Select
          value={String(state.kmin)}
          onValueChange={(value) => setState({ kmin: Number(value) })}
        >
          <SelectTrigger aria-label="Minimum match" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MATCH_FLOORS.map((floor) => (
              <SelectItem key={floor} value={String(floor)}>
                {floor === 0 ? 'Any match' : `Match ≥ ${floor}%`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={state.kowner || 'all'}
          onValueChange={(value) => setState({ kowner: value === 'all' ? '' : value })}
        >
          <SelectTrigger aria-label="Owner" className="w-44">
            <SelectValue placeholder="Owner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any owner</SelectItem>
            {owners.map((owner) => (
              <SelectItem key={owner.id} value={owner.id}>
                {owner.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mobile && board.data && (
          <Select
            value={state.kcol || board.data.columns[0]?.key}
            onValueChange={(value) => setState({ kcol: value })}
          >
            <SelectTrigger aria-label="Column" className="w-full">
              <SelectValue placeholder="Column" />
            </SelectTrigger>
            <SelectContent>
              {board.data.columns.map((column) => (
                <SelectItem key={column.key} value={column.key}>
                  {column.label} ({column.total})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {board.data && (
          <span className="ml-auto text-caption text-ink-subtle tabular-nums">
            {filtered ? `${board.data.count} of ${board.data.total}` : board.data.total} candidates
          </span>
        )}
        {job.permissions.can_work_pipeline && isWorkable(job.status) && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/search?jd=${job.id}`}>
              <UserSearchIcon data-icon="inline-start" aria-hidden="true" />
              Run new search
            </Link>
          </Button>
        )}
      </div>
      {board.isPending ? (
        <div
          aria-busy="true"
          aria-label="Loading board"
          className="flex gap-3 overflow-x-auto pb-3 max-md:-mx-4 max-md:px-4"
        >
          {Array.from({ length: 5 }, (_, index) => (
            <SkeletonCard key={index} lines={6} className="w-[280px] shrink-0 max-md:w-[85vw]" />
          ))}
        </div>
      ) : board.isError ? (
        <ErrorState
          title="Couldn't load the board"
          error={board.error}
          onRetry={() => void board.refetch()}
        />
      ) : filtered && board.data.count === 0 ? (
        <div className="rounded-card border border-line bg-surface">
          <EmptyState
            icon={SearchXIcon}
            title="No candidates match these filters"
            description="Try a different search or clear the filters to see everyone on the board."
            action={
              <Button type="button" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <KanbanBoard
          job={job}
          board={board.data}
          filtered={filtered}
          actions={actions}
          onAddCandidate={() => setAddOpen(true)}
          focusColumn={mobile ? state.kcol || undefined : undefined}
        />
      )}
      {actions.dialogs}
      <AddExistingCandidateDialog job={job} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
