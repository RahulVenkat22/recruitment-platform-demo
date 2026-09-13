import type { SortingState } from '@tanstack/react-table'
import { param, type UrlState } from '@/lib/hooks'

export type JobView = 'table' | 'cards'

/** plan.md 9.4: every filter, the sort, the page and the view live in the URL. */
export const JOB_LIST_SPEC = {
  view: param.enum<JobView>('table', ['table', 'cards']),
  q: param.string(''),
  status: param.list<string>([]),
  department: param.list<string>([]),
  location: param.list<string>([]),
  type: param.list<string>([]),
  mode: param.list<string>([]),
  mine: param.boolean(false),
  sort: param.string('-updated_at'),
  page: param.number(1),
}

export type JobListState = UrlState<typeof JOB_LIST_SPEC>

export const SORT_OPTIONS = [
  { key: '-updated_at', label: 'Recently updated' },
  { key: '-created_at', label: 'Newest first' },
  { key: 'created_at', label: 'Oldest first' },
  { key: 'title', label: 'Title A–Z' },
  { key: '-title', label: 'Title Z–A' },
  { key: '-count_candidates', label: 'Most candidates' },
] as const

export const FILTER_KEYS = [
  'q',
  'status',
  'department',
  'location',
  'type',
  'mode',
  'mine',
] as const

export function hasActiveFilters(state: JobListState): boolean {
  return (
    state.q !== '' ||
    state.status.length > 0 ||
    state.department.length > 0 ||
    state.location.length > 0 ||
    state.type.length > 0 ||
    state.mode.length > 0 ||
    state.mine
  )
}

export const CLEARED_FILTERS: Pick<JobListState, (typeof FILTER_KEYS)[number] | 'page'> = {
  q: '',
  status: [],
  department: [],
  location: [],
  type: [],
  mode: [],
  mine: false,
  page: 1,
}

/** "-count_candidates" -> [{ id: "count_candidates", desc: true }]. */
export function sortingFromParam(sort: string): SortingState {
  if (!sort) return []
  const desc = sort.startsWith('-')
  return [{ id: desc ? sort.slice(1) : sort, desc }]
}

export function paramFromSorting(sorting: SortingState, fallback = '-updated_at'): string {
  const [first] = sorting
  if (!first) return fallback
  return `${first.desc ? '-' : ''}${first.id}`
}
