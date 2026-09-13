import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  ApplicationDetail,
  ApplicationRow,
  BulkTransitionResponse,
  CandidateMatch,
  Move,
  Paginated,
  ProviderHealth,
  SearchResponse,
  SearchRun,
  TransitionResponse,
} from '@/types/domain'

// ------------------------------------------------------------------ params

export interface ApplicationListParams {
  page?: number
  page_size?: number
  job_description?: string
  candidate?: string
  owner?: string
  search_run?: string
  status?: string[]
  status_group?: string
  source?: string[]
  min_match?: number
  is_starred?: boolean
  search?: string
  ordering?: string
}

type QueryValue = string | number | boolean

export function toQuery<T extends object>(params: T): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {}
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    if (Array.isArray(value)) {
      if (value.length > 0) query[key] = value.join(',')
      continue
    }
    query[key] = value as QueryValue
  }
  return query
}

// ---------------------------------------------------------------- fetchers

export async function fetchSources(): Promise<ProviderHealth[]> {
  const { data } = await api.get<ProviderHealth[]>(endpoints.sources)
  return data
}

export async function fetchSearchRuns(jobId: string): Promise<SearchRun[]> {
  const { data } = await api.get<Paginated<SearchRun>>(endpoints.searches, {
    params: { job_description: jobId, page_size: 20 },
  })
  return data.results
}

export async function runSearch(jobId: string, sources: string[]): Promise<SearchResponse> {
  const { data } = await api.post<SearchResponse>(endpoints.searches, {
    job_description_id: jobId,
    sources: sources.length ? sources : ['all'],
  })
  return data
}

export async function fetchApplications(
  params: ApplicationListParams,
): Promise<Paginated<ApplicationRow>> {
  const { data } = await api.get<Paginated<ApplicationRow>>(endpoints.applications, {
    params: toQuery(params),
  })
  return data
}

export async function fetchApplication(id: string): Promise<ApplicationDetail> {
  const { data } = await api.get<ApplicationDetail>(endpoints.application(id))
  return data
}

export async function fetchMoves(id: string): Promise<Move[]> {
  const { data } = await api.get<Move[]>(endpoints.applicationAction(id, 'moves'))
  return data
}

export interface TransitionInput {
  id: string
  status: string
  note?: string
  reason?: string
}

export async function transitionApplication(input: TransitionInput): Promise<TransitionResponse> {
  const { data } = await api.post<TransitionResponse>(
    endpoints.applicationAction(input.id, 'transition'),
    { status: input.status, note: input.note ?? '', reason: input.reason ?? '' },
  )
  return data
}

export interface BulkTransitionInput {
  ids: string[]
  status: string
  note?: string
}

export async function bulkTransition(input: BulkTransitionInput): Promise<BulkTransitionResponse> {
  const { data } = await api.post<BulkTransitionResponse>(endpoints.applicationsBulkTransition, {
    ids: input.ids,
    status: input.status,
    note: input.note ?? '',
  })
  return data
}

export interface ApplicationPatch {
  owner_id?: string | null
  is_starred?: boolean
  notes?: string
}

export async function updateApplication(
  id: string,
  patch: ApplicationPatch,
): Promise<ApplicationDetail> {
  const { data } = await api.patch<ApplicationDetail>(endpoints.application(id), patch)
  return data
}

export async function rematchApplication(id: string): Promise<CandidateMatch> {
  const { data } = await api.post<CandidateMatch>(endpoints.applicationAction(id, 'rematch'))
  return data
}

// ----------------------------------------------------------------- queries

export function useSources() {
  return useQuery({ queryKey: qk.sources.health(), queryFn: fetchSources, staleTime: 60_000 })
}

export function useSearchRuns(jobId: string | undefined) {
  return useQuery({
    queryKey: qk.searches.byJob(jobId ?? ''),
    queryFn: () => fetchSearchRuns(jobId as string),
    enabled: Boolean(jobId),
  })
}

export function useApplications(params: ApplicationListParams, enabled = true) {
  return useQuery({
    queryKey: qk.applications.list(toQuery(params)),
    queryFn: () => fetchApplications(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useApplication(id: string | undefined) {
  return useQuery({
    queryKey: qk.applications.detail(id ?? ''),
    queryFn: () => fetchApplication(id as string),
    enabled: Boolean(id),
  })
}

export function useMoves(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.applications.moves(id ?? ''),
    queryFn: () => fetchMoves(id as string),
    enabled: Boolean(id) && enabled,
    staleTime: 0,
  })
}

// --------------------------------------------------------------- mutations

export interface InvalidateExtras {
  interviews?: boolean
  communications?: boolean
  offers?: boolean
  onboardings?: boolean
}

/** Everything a pipeline change can make stale (plan.md 7.2). */
export function useInvalidatePipeline() {
  const client = useQueryClient()
  return async (jobId?: string, extras: InvalidateExtras = {}) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: qk.applications.all }),
      client.invalidateQueries({ queryKey: qk.candidates.all }),
      client.invalidateQueries({ queryKey: qk.activities.all }),
      client.invalidateQueries({ queryKey: qk.dashboard.all }),
      client.invalidateQueries({ queryKey: qk.searches.all }),
      client.invalidateQueries({ queryKey: qk.notifications.all }),
      client.invalidateQueries({ queryKey: qk.interviews.all }),
      extras.communications
        ? client.invalidateQueries({ queryKey: qk.communications.all })
        : Promise.resolve(),
      extras.offers || extras.onboardings
        ? Promise.all([
            client.invalidateQueries({ queryKey: qk.offers.all }),
            client.invalidateQueries({ queryKey: qk.onboardings.all }),
          ])
        : Promise.resolve(),
      jobId
        ? client.invalidateQueries({ queryKey: qk.jobs.detail(jobId) })
        : client.invalidateQueries({ queryKey: qk.jobs.all }),
    ])
  }
}

export function useRunSearch() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: ({ jobId, sources }: { jobId: string; sources: string[] }) =>
      runSearch(jobId, sources),
    onSuccess: (_result, { jobId }) => invalidate(jobId),
  })
}

export function useTransition() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: (input: TransitionInput) => transitionApplication(input),
    onSuccess: (result) => invalidate(result.application.job_description),
  })
}

export function useBulkTransition() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: (input: BulkTransitionInput) => bulkTransition(input),
    onSuccess: (result) => invalidate(result.moved[0]?.job_description),
  })
}

export function useUpdateApplication() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ApplicationPatch }) =>
      updateApplication(id, patch),
    onSuccess: (result) => invalidate(result.job_description),
  })
}

export function useRematch() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: (id: string) => rematchApplication(id),
    onSuccess: () => invalidate(),
  })
}
