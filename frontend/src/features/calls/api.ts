import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toQuery, useInvalidatePipeline } from '@/features/applications/api'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  BulkPhoneCallRequest,
  BulkPhoneCallResult,
  Paginated,
  PhoneCall,
  PhoneCallCreateRequest,
  VoiceConfig,
} from '@/types/domain'

export interface CallListParams {
  page?: number
  page_size?: number
  application?: string
  job_description?: string
  candidate?: string
  status?: string[]
  purpose?: string[]
  ordering?: string
}

/** One line of the conversation as the backend stores it. */
export interface CallTurn {
  role: 'ai' | 'candidate'
  text: string
}

export interface CallAssessment {
  summary?: string
  overall_score?: number
  questions?: { question: string; answer_summary: string; score: number; notes: string }[]
  strengths?: string[]
  concerns?: string[]
  recommendation?: string
  information_acknowledged?: boolean
  candidate_questions?: string[]
}

export const LIVE_STATUSES = new Set(['queued', 'ringing', 'in_progress'])

export function turnsOf(call: PhoneCall): CallTurn[] {
  return Array.isArray(call.transcript) ? (call.transcript as CallTurn[]) : []
}

export function assessmentOf(call: PhoneCall): CallAssessment | null {
  return call.assessment && typeof call.assessment === 'object'
    ? (call.assessment as CallAssessment)
    : null
}

export async function fetchCalls(params: CallListParams): Promise<Paginated<PhoneCall>> {
  const { data } = await api.get<Paginated<PhoneCall>>(endpoints.calls, { params: toQuery(params) })
  return data
}

export async function fetchCall(id: string): Promise<PhoneCall> {
  const { data } = await api.get<PhoneCall>(endpoints.call(id))
  return data
}

export async function fetchVoiceConfig(): Promise<VoiceConfig> {
  const { data } = await api.get<VoiceConfig>(endpoints.callsConfig)
  return data
}

export async function startCall(
  applicationId: string,
  body: PhoneCallCreateRequest,
): Promise<PhoneCall> {
  const { data } = await api.post<PhoneCall>(
    endpoints.applicationAction(applicationId, 'calls'),
    body,
  )
  return data
}

export async function bulkCall(body: BulkPhoneCallRequest): Promise<BulkPhoneCallResult> {
  const { data } = await api.post<BulkPhoneCallResult>(endpoints.applicationsBulkCalls, body)
  return data
}

export async function replyCall(id: string, answer: string): Promise<PhoneCall> {
  const { data } = await api.post<PhoneCall>(endpoints.callAction(id, 'reply'), { answer })
  return data
}

export async function finishCall(id: string): Promise<PhoneCall> {
  const { data } = await api.post<PhoneCall>(endpoints.callAction(id, 'finish'))
  return data
}

export function useCalls(params: CallListParams, enabled = true) {
  return useQuery({
    queryKey: qk.calls.list(toQuery(params)),
    queryFn: () => fetchCalls(params),
    placeholderData: keepPreviousData,
    enabled,
    // A real call in flight changes status through the provider's webhooks.
    refetchInterval: (query) =>
      query.state.data?.results.some(
        (call) => call.mode === 'phone' && LIVE_STATUSES.has(call.status),
      )
        ? 5_000
        : false,
  })
}

export function useVoiceConfig() {
  return useQuery({ queryKey: qk.calls.config(), queryFn: fetchVoiceConfig, staleTime: 60_000 })
}

function useCallsChanged() {
  const client = useQueryClient()
  const invalidate = useInvalidatePipeline()
  return async (call?: PhoneCall) => {
    await client.invalidateQueries({ queryKey: qk.calls.all })
    await invalidate(call?.application.job_description, { communications: true })
  }
}

export function useStartCall() {
  const changed = useCallsChanged()
  return useMutation({
    mutationFn: ({ id, ...body }: PhoneCallCreateRequest & { id: string }) => startCall(id, body),
    onSuccess: (call) => changed(call),
  })
}

export function useBulkCall() {
  const changed = useCallsChanged()
  return useMutation({ mutationFn: bulkCall, onSuccess: () => changed() })
}

export function useCallReply() {
  const changed = useCallsChanged()
  return useMutation({
    mutationFn: ({ id, answer }: { id: string; answer: string }) => replyCall(id, answer),
    onSuccess: (call) => (LIVE_STATUSES.has(call.status) ? undefined : changed(call)),
  })
}

export function useFinishCall() {
  const changed = useCallsChanged()
  return useMutation({ mutationFn: finishCall, onSuccess: (call) => changed(call) })
}
