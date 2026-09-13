import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { toQuery, useInvalidatePipeline } from '@/features/applications/api'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type { Communication, CommunicationCreateRequest, Paginated } from '@/types/domain'

export interface CommunicationListParams {
  page?: number
  page_size?: number
  application?: string
  job_description?: string
  candidate?: string
  channel?: string[]
  outcome?: string[]
}

export async function fetchCommunications(
  params: CommunicationListParams,
): Promise<Paginated<Communication>> {
  const { data } = await api.get<Paginated<Communication>>(endpoints.communications, {
    params: toQuery(params),
  })
  return data
}

export async function logCommunication(body: CommunicationCreateRequest): Promise<Communication> {
  const { data } = await api.post<Communication>(endpoints.communications, body)
  return data
}

export function useCommunications(params: CommunicationListParams, enabled = true) {
  return useQuery({
    queryKey: qk.communications.list(toQuery(params)),
    queryFn: () => fetchCommunications(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useLogCommunication() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: (body: CommunicationCreateRequest) => logCommunication(body),
    onSuccess: (result) => invalidate(result.application.job_description, { communications: true }),
  })
}
