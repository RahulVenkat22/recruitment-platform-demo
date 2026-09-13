import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk, type QueryFilters } from '@/lib/query-keys'
import type { Activity, ActivityPage } from '@/types/domain'

export const TIMELINE_PAGE_SIZE = 200

export interface ActivityScope {
  job_description?: string
  application?: string
  candidate?: string
  actor?: string
  category?: string[]
  event_type?: string[]
  search?: string
  since?: string
  limit?: number
}

export interface ActivityCursor {
  before: string
  before_id: string
}

function toQuery(
  scope: ActivityScope,
  cursor: ActivityCursor | null,
): Record<string, string | number> {
  const query: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(scope)) {
    if (value === undefined || value === '' || value === null) continue
    if (Array.isArray(value)) {
      if (value.length) query[key] = value.join(',')
      continue
    }
    query[key] = value as string | number
  }
  if (cursor) {
    query.before = cursor.before
    if (cursor.before_id) query.before_id = cursor.before_id
  }
  return query
}

export async function fetchActivities(
  scope: ActivityScope,
  cursor: ActivityCursor | null = null,
): Promise<ActivityPage> {
  const { data } = await api.get<ActivityPage>(endpoints.activities, {
    params: toQuery(scope, cursor),
  })
  return data
}

function keyFor(scope: ActivityScope) {
  const filters = scope as QueryFilters
  if (scope.job_description) return qk.activities.byJob(scope.job_description, filters)
  if (scope.application)
    return [...qk.activities.byApplication(scope.application), filters] as const
  if (scope.candidate) return [...qk.activities.byCandidate(scope.candidate), filters] as const
  return [...qk.activities.all, 'feed', filters] as const
}

/**
 * An activity feed as pages of at most 200, newest first (plan.md 9.6: the tab
 * loads the latest 200 and "Load older events" appends the next 200).
 */
export function useTimeline(scope: ActivityScope, enabled = true) {
  const withLimit = { limit: TIMELINE_PAGE_SIZE, ...scope }
  return useInfiniteQuery({
    queryKey: keyFor(withLimit),
    queryFn: ({ pageParam }) => fetchActivities(withLimit, pageParam),
    initialPageParam: null as ActivityCursor | null,
    getNextPageParam: (last): ActivityCursor | undefined =>
      last.has_more && last.next_before
        ? { before: last.next_before, before_id: last.next_before_id ?? '' }
        : undefined,
    enabled,
  })
}

export function flattenActivities(data: InfiniteData<ActivityPage> | undefined): Activity[] {
  return data?.pages.flatMap((page) => page.results) ?? []
}
