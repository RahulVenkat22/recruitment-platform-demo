import { param } from '@/lib/hooks'

/** Homepage filters and sort live in the URL like every other list (plan.md 7.1). */
export const HOME_SPEC = {
  q: param.string(''),
  status: param.list<string>([]),
  /** High-level users only: "Mine" limits the table to JDs they created or are listed on. */
  mine: param.boolean(false),
  /** High-level users with Mine off: keep JDs raised by these users (ids). */
  creator: param.list<string>([]),
  sort: param.string('-last_activity_at'),
  page: param.number(1),
}

export const HOME_SORT_OPTIONS = [
  { key: '-last_activity_at', label: 'Latest update' },
  { key: '-updated_at', label: 'Recently edited' },
  { key: '-created_at', label: 'Newest first' },
  { key: 'title', label: 'Title A–Z' },
  { key: 'status', label: 'Status' },
] as const

export const HOME_CLEARED = { q: '', status: [] as string[], creator: [] as string[], page: 1 }

/** Copy for the empty table when nothing is filtered out (Enhancement.md 3). */
export const NO_WORK_TITLE = 'You have no previous works yet.'

/** Tone of the completion meter: lime while in progress, green once the openings are filled. */
export function completionTone(value: number): 'done' | 'progress' | 'idle' {
  if (value >= 100) return 'done'
  if (value > 0) return 'progress'
  return 'idle'
}
