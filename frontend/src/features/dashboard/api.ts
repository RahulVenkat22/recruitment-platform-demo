import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  AttentionCounts,
  DashboardDetails,
  DashboardInsights,
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

export function useInsights(scope: DashboardScope) {
  return useQuery({
    queryKey: qk.dashboard.insights(params(scope)),
    queryFn: () => get<DashboardInsights>('insights', params(scope)),
    placeholderData: keepPreviousData,
  })
}

export type ExportKind = 'csv' | 'xlsx' | 'pdf'

/** Every figure and table for the scope as one file, named by the server after the window it covers. */
export async function exportDashboard(scope: DashboardScope, kind: ExportKind, jobId?: string) {
  const response = await api.get<Blob>(endpoints.dashboard(`export/${kind}`), {
    params: params(scope, jobId ? { job_description: jobId } : {}),
    responseType: 'blob',
  })
  const disposition = String(response.headers['content-disposition'] ?? '')
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `dashboard.${kind}`
  return { blob: response.data, filename }
}

/** Which figure to open in place, plus the narrowing some figures take. */
export interface DetailQuery {
  metric: string
  /** Application statuses, for a pipeline stage. */
  statuses?: readonly string[]
  /** One job description, for a role or a stage of it. */
  jobId?: string
  /** The source, skill, band, department, channel or offer status. */
  key?: string
}

function detailParams(query: DetailQuery): Record<string, string> {
  return {
    metric: query.metric,
    ...(query.statuses?.length ? { statuses: query.statuses.join(',') } : {}),
    ...(query.jobId ? { job_description: query.jobId } : {}),
    ...(query.key ? { key: query.key } : {}),
  }
}

/** The rows behind one figure; nothing is fetched until a figure is chosen. */
export function useDetails(scope: DashboardScope, query: DetailQuery | null) {
  const extra = query ? detailParams(query) : { metric: '' }
  return useQuery({
    queryKey: qk.dashboard.details(params(scope), extra),
    queryFn: () => get<DashboardDetails>('details', params(scope, extra)),
    enabled: query !== null,
  })
}
