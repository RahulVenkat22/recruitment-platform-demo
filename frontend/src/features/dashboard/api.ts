import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type { Activity, ApplicationRow, DashboardSummary, Funnel, Interview } from '@/types/domain'

async function get<T>(part: string, params?: Record<string, string>): Promise<T> {
  const { data } = await api.get<T>(endpoints.dashboard(part), { params })
  return data
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: qk.dashboard.summary(),
    queryFn: () => get<DashboardSummary>('summary'),
  })
}

export function useFunnel(jobId?: string) {
  return useQuery({
    queryKey: qk.dashboard.funnel(jobId),
    queryFn: () => get<Funnel>('funnel', jobId ? { job_description: jobId } : undefined),
  })
}

export function useRecentActivity() {
  return useQuery({
    queryKey: qk.dashboard.recentActivity(),
    queryFn: () => get<Activity[]>('recent-activity'),
  })
}

export function useTopCandidates() {
  return useQuery({
    queryKey: qk.dashboard.topCandidates(),
    queryFn: () => get<ApplicationRow[]>('top-candidates'),
  })
}

export function useUpcomingInterviews() {
  return useQuery({
    queryKey: qk.dashboard.upcomingInterviews(),
    queryFn: () => get<Interview[]>('upcoming-interviews'),
  })
}
