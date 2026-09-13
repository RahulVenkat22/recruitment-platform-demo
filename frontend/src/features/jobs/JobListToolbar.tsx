import { SearchIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { FilterPopover } from '@/components/shared/FilterPopover'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import {
  CLEARED_FILTERS,
  hasActiveFilters,
  SORT_OPTIONS,
  type JobListState,
  type JobView,
} from '@/features/jobs/job-list-state'
import { ViewToggle } from '@/features/jobs/ViewToggle'
import { useDebounce } from '@/lib/hooks'
import type { JobFacets } from '@/types/domain'

export interface JobListToolbarProps {
  state: JobListState
  onChange: (patch: Partial<JobListState>) => void
  facets: JobFacets | undefined
  /** Mobile forces the card view and moves the filters into a bottom sheet. */
  mobile: boolean
}

/** Search, filter popovers with facet counts, "Mine only", sort and the view toggle (plan.md 9.4). */
export function JobListToolbar({ state, onChange, facets, mobile }: JobListToolbarProps) {
  const searchId = useId()
  const mineId = useId()
  const [draft, setDraft] = useState(state.q)
  const [syncedQ, setSyncedQ] = useState(state.q)
  const debounced = useDebounce(draft, 300)
  const [sheetOpen, setSheetOpen] = useState(false)

  // A "Clear filters" elsewhere (the empty state) empties the URL; mirror it into the box.
  if (state.q !== syncedQ) {
    setSyncedQ(state.q)
    if (state.q === '') setDraft('')
  }

  // Push the debounced search into the URL; typing resets the page.
  useEffect(() => {
    if (debounced !== state.q) onChange({ q: debounced, page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const active = hasActiveFilters(state)
  const activeCount =
    state.status.length +
    state.department.length +
    state.location.length +
    state.type.length +
    state.mode.length +
    (state.mine ? 1 : 0)

  const filters: ReactNode = (
    <>
      <FilterPopover
        label="Status"
        options={facets?.statuses ?? []}
        selected={state.status}
        onChange={(status) => onChange({ status, page: 1 })}
      />
      <FilterPopover
        label="Department"
        options={facets?.departments ?? []}
        selected={state.department}
        onChange={(department) => onChange({ department, page: 1 })}
        searchable
      />
      <FilterPopover
        label="Location"
        options={facets?.locations ?? []}
        selected={state.location}
        onChange={(location) => onChange({ location, page: 1 })}
        searchable
      />
      <FilterPopover
        label="Type"
        options={facets?.employment_types ?? []}
        selected={state.type}
        onChange={(type) => onChange({ type, page: 1 })}
      />
      <FilterPopover
        label="Mode"
        options={facets?.work_modes ?? []}
        selected={state.mode}
        onChange={(mode) => onChange({ mode, page: 1 })}
      />
      <div className="inline-flex h-8 items-center gap-2 rounded-control border border-line bg-surface px-2.5">
        <Switch
          id={mineId}
          size="sm"
          checked={state.mine}
          onCheckedChange={(mine) => onChange({ mine, page: 1 })}
        />
        <Label htmlFor={mineId} className="text-small font-normal text-ink-muted">
          Mine only
        </Label>
      </div>
    </>
  )

  return (
    <div data-slot="job-list-toolbar" className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 basis-56">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
        />
        <Input
          id={searchId}
          type="search"
          aria-label="Search job descriptions"
          placeholder="Search by title, department or skill…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="bg-surface pl-8"
        />
      </div>

      {mobile ? (
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => setSheetOpen(true)}>
            <SlidersHorizontalIcon data-icon="inline-start" aria-hidden="true" />
            Filters
            {activeCount > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-primary px-1 text-[10px] font-medium text-white tabular-nums">
                {activeCount}
              </span>
            )}
          </Button>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-card">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription className="sr-only">
                  Narrow the list by status, department, location, employment type, work mode or
                  whether you are involved.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-wrap gap-2 px-4 pb-6">{filters}</div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        filters
      )}

      <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
        {active && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-ink-muted"
            onClick={() => {
              setDraft('')
              onChange(CLEARED_FILTERS)
            }}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            Clear filters
          </Button>
        )}
        <Select value={state.sort} onValueChange={(sort) => onChange({ sort, page: 1 })}>
          <SelectTrigger size="sm" aria-label="Sort" className="bg-surface">
            <span className="text-ink-subtle">Sort:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!mobile && (
          <ViewToggle view={state.view} onChange={(view: JobView) => onChange({ view })} />
        )}
      </div>
    </div>
  )
}
