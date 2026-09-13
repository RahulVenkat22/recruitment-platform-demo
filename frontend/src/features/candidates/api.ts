import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toQuery } from '@/features/applications/api'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  ApplicationDetail,
  CandidateDetail,
  CandidatePatch,
  CandidateRow,
  CandidateWriteRequest,
  Paginated,
} from '@/types/domain'

export interface CandidateListParams {
  page?: number
  page_size?: number
  search?: string
  skills?: string[]
  source?: string[]
  location?: string
  min_exp?: number
  max_exp?: number
  status?: string[]
  job_description?: string
  ordering?: string
}

export async function fetchCandidates(
  params: CandidateListParams,
): Promise<Paginated<CandidateRow>> {
  const { data } = await api.get<Paginated<CandidateRow>>(endpoints.candidates, {
    params: toQuery(params),
  })
  return data
}

export async function fetchCandidate(id: string): Promise<CandidateDetail> {
  const { data } = await api.get<CandidateDetail>(endpoints.candidate(id))
  return data
}

export async function createCandidate(body: CandidateWriteRequest): Promise<CandidateDetail> {
  const { data } = await api.post<CandidateDetail>(endpoints.candidates, body)
  return data
}

export async function updateCandidate(id: string, body: CandidatePatch): Promise<CandidateDetail> {
  const { data } = await api.patch<CandidateDetail>(endpoints.candidate(id), body)
  return data
}

export async function addCandidateToJob(
  candidateId: string,
  jobId: string,
): Promise<ApplicationDetail> {
  const { data } = await api.post<ApplicationDetail>(endpoints.applications, {
    candidate_id: candidateId,
    job_description_id: jobId,
  })
  return data
}

export function useCandidates(params: CandidateListParams) {
  return useQuery({
    queryKey: qk.candidates.list(toQuery(params)),
    queryFn: () => fetchCandidates(params),
    placeholderData: keepPreviousData,
  })
}

export function useCandidate(id: string | undefined) {
  return useQuery({
    queryKey: qk.candidates.detail(id ?? ''),
    queryFn: () => fetchCandidate(id as string),
    enabled: Boolean(id),
  })
}

function useInvalidateCandidates() {
  const client = useQueryClient()
  return async (jobId?: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: qk.candidates.all }),
      client.invalidateQueries({ queryKey: qk.applications.all }),
      client.invalidateQueries({ queryKey: qk.activities.all }),
      client.invalidateQueries({ queryKey: qk.dashboard.all }),
      jobId ? client.invalidateQueries({ queryKey: qk.jobs.detail(jobId) }) : Promise.resolve(),
    ])
  }
}

export function useCreateCandidate() {
  const invalidate = useInvalidateCandidates()
  return useMutation({
    mutationFn: (body: CandidateWriteRequest) => createCandidate(body),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateCandidate(id: string) {
  const invalidate = useInvalidateCandidates()
  return useMutation({
    mutationFn: (body: CandidatePatch) => updateCandidate(id, body),
    onSuccess: () => invalidate(),
  })
}

export function useAddCandidateToJob() {
  const invalidate = useInvalidateCandidates()
  return useMutation({
    mutationFn: ({ candidateId, jobId }: { candidateId: string; jobId: string }) =>
      addCandidateToJob(candidateId, jobId),
    onSuccess: (result) => invalidate(result.job_description),
  })
}
