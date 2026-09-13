import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { toQuery, useInvalidatePipeline } from '@/features/applications/api'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  FeedbackRequest,
  Interview,
  InterviewCreateRequest,
  InterviewPatch,
  InterviewRescheduleRequest,
  Paginated,
} from '@/types/domain'

export type InterviewBucket =
  'upcoming' | 'today' | 'completed' | 'past' | 'pending_feedback' | 'all'

export interface InterviewListParams {
  page?: number
  page_size?: number
  job_description?: string
  application?: string
  candidate?: string
  interviewer?: string
  status?: string[]
  round?: string[]
  from?: string
  to?: string
  mine?: boolean
  bucket?: InterviewBucket
  search?: string
  ordering?: string
}

export async function fetchInterviews(params: InterviewListParams): Promise<Paginated<Interview>> {
  const query = toQuery({ ...params, bucket: params.bucket === 'all' ? undefined : params.bucket })
  const { data } = await api.get<Paginated<Interview>>(endpoints.interviews, { params: query })
  return data
}

export async function fetchInterview(id: string): Promise<Interview> {
  const { data } = await api.get<Interview>(endpoints.interview(id))
  return data
}

export async function scheduleInterview(body: InterviewCreateRequest): Promise<Interview> {
  const { data } = await api.post<Interview>(endpoints.interviews, body)
  return data
}

export async function updateInterview(id: string, body: InterviewPatch): Promise<Interview> {
  const { data } = await api.patch<Interview>(endpoints.interview(id), body)
  return data
}

export async function deleteInterview(id: string): Promise<void> {
  await api.delete(endpoints.interview(id))
}

export async function submitFeedback(id: string, body: FeedbackRequest): Promise<Interview> {
  const { data } = await api.post<Interview>(endpoints.interviewAction(id, 'feedback'), body)
  return data
}

export async function rescheduleInterview(
  id: string,
  body: InterviewRescheduleRequest,
): Promise<Interview> {
  const { data } = await api.post<Interview>(endpoints.interviewAction(id, 'reschedule'), body)
  return data
}

export async function cancelInterview(id: string, reason = ''): Promise<Interview> {
  const { data } = await api.post<Interview>(endpoints.interviewAction(id, 'cancel'), { reason })
  return data
}

export function useInterviews(params: InterviewListParams, enabled = true) {
  return useQuery({
    queryKey: qk.interviews.list(toQuery(params)),
    queryFn: () => fetchInterviews(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useInterview(id: string | undefined) {
  return useQuery({
    queryKey: qk.interviews.detail(id ?? ''),
    queryFn: () => fetchInterview(id as string),
    enabled: Boolean(id),
  })
}

function useInterviewMutation<TInput>(run: (input: TInput) => Promise<Interview>) {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => invalidate(result.application.job_description, { interviews: true }),
  })
}

export function useScheduleInterview() {
  return useInterviewMutation((body: InterviewCreateRequest) => scheduleInterview(body))
}

export function useUpdateInterview() {
  return useInterviewMutation(({ id, body }: { id: string; body: InterviewPatch }) =>
    updateInterview(id, body),
  )
}

export function useDeleteInterview() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: (id: string) => deleteInterview(id),
    onSuccess: () => invalidate(undefined, { interviews: true }),
  })
}

export function useSubmitFeedback() {
  return useInterviewMutation(({ id, body }: { id: string; body: FeedbackRequest }) =>
    submitFeedback(id, body),
  )
}

export function useRescheduleInterview() {
  return useInterviewMutation(({ id, body }: { id: string; body: InterviewRescheduleRequest }) =>
    rescheduleInterview(id, body),
  )
}

export function useCancelInterview() {
  return useInterviewMutation(({ id, reason }: { id: string; reason?: string }) =>
    cancelInterview(id, reason),
  )
}
