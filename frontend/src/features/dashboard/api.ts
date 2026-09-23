import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  AttentionCounts,
  DashboardPipeline,
  DashboardSummary,
  DashboardTrends,
  Funnel,
  Interview,
  InterviewInsights,
  TeamMember,
} from '@/types/domain'

export type RangeDays = 7 | 30 | 90

/** The window every dashboard call covers: a preset, or any two days that then win over it. */
export interface DashboardWindow {
  range: RangeDays
  /** Custom inclusive window as ISO dates, both or neither. */
  start?: string
  end?: string
}

/** What every dashboard call is scoped to: the window and, optionally, some people. */
export interface DashboardScope extends DashboardWindow {
  /** Narrow to the job descriptions these users created or are listed on; empty means everyone. */
  users?: readonly string[]
}

function params(scope: DashboardScope, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(scope.start && scope.end
      ? { start: scope.start, end: scope.end }
      : { range: String(scope.range) }),
    ...(scope.users?.length ? { user: scope.users.join(',') } : {}),
    ...extra,
  }
}

async function get<T>(part: string, query: Record<string, string>): Promise<T> {
  const { data } = await api.get<T>(endpoints.dashboard(part), { params: query })
  return data
}

// Every widget keeps its previous render while a new scope loads (no skeleton flash).

export function useDashboardSummary(scope: DashboardScope) {
  return useQuery({
    queryKey: qk.dashboard.summary(params(scope)),
    queryFn: () => get<DashboardSummary>('summary', params(scope)),
    placeholderData: keepPreviousData,
  })
}

export function useTrends(scope: DashboardScope) {
  return useQuery({
    queryKey: qk.dashboard.trends(params(scope)),
    queryFn: () => get<DashboardTrends>('trends', params(scope)),
    placeholderData: keepPreviousData,
  })
}

export function usePipeline(scope: DashboardScope) {
  return useQuery({
    queryKey: qk.dashboard.pipeline(params(scope)),
    queryFn: () => get<DashboardPipeline>('pipeline', params(scope)),
    placeholderData: keepPreviousData,
  })
}

export function useFunnel(scope: DashboardScope, jobId?: string) {
  return useQuery({
    queryKey: qk.dashboard.funnel(params(scope), jobId),
    queryFn: () => get<Funnel>('funnel', params(scope, jobId ? { job_description: jobId } : {})),
    placeholderData: keepPreviousData,
  })
}

export function useInterviewInsights(scope: DashboardScope) {
  return useQuery({
    queryKey: qk.dashboard.interviews(params(scope)),
    queryFn: () => get<InterviewInsights>('interviews', params(scope)),
    placeholderData: keepPreviousData,
  })
}

export function useAttention(scope: DashboardScope) {
  return useQuery({
    queryKey: qk.dashboard.attention(params(scope)),
    queryFn: () => get<AttentionCounts>('attention', params(scope)),
    placeholderData: keepPreviousData,
  })
}

/** Team activity ignores the people filter: it is the control that sets it. */
export function useTeam(window: DashboardWindow) {
  return useQuery({
    queryKey: qk.dashboard.team(params(window)),
    queryFn: () => get<TeamMember[]>('team', params(window)),
    placeholderData: keepPreviousData,
  })
}

export function useUpcomingInterviews(scope: DashboardScope) {
  return useQuery({
    queryKey: qk.dashboard.upcomingInterviews(params(scope)),
    queryFn: () => get<Interview[]>('upcoming-interviews', params(scope)),
    placeholderData: keepPreviousData,
  })
}
