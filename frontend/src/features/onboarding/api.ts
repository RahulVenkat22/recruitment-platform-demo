import { useMutation, useQuery } from '@tanstack/react-query'
import { toQuery, useInvalidatePipeline } from '@/features/applications/api'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  Onboarding,
  OnboardingCreateRequest,
  OnboardingPatch,
  Paginated,
} from '@/types/domain'

export interface OnboardingListParams {
  page?: number
  page_size?: number
  application?: string
  job_description?: string
  candidate?: string
  status?: string[]
}

export async function fetchOnboardings(
  params: OnboardingListParams,
): Promise<Paginated<Onboarding>> {
  const { data } = await api.get<Paginated<Onboarding>>(endpoints.onboardings, {
    params: toQuery(params),
  })
  return data
}

export async function startOnboarding(body: OnboardingCreateRequest): Promise<Onboarding> {
  const { data } = await api.post<Onboarding>(endpoints.onboardings, body)
  return data
}

export async function updateOnboarding(id: string, body: OnboardingPatch): Promise<Onboarding> {
  const { data } = await api.patch<Onboarding>(endpoints.onboarding(id), body)
  return data
}

export async function completeOnboarding(id: string): Promise<Onboarding> {
  const { data } = await api.post<Onboarding>(endpoints.onboardingAction(id, 'complete'))
  return data
}

export function useOnboardings(params: OnboardingListParams, enabled = true) {
  return useQuery({
    queryKey: qk.onboardings.list(toQuery(params)),
    queryFn: () => fetchOnboardings(params),
    enabled,
  })
}

function useOnboardingMutation<TInput>(run: (input: TInput) => Promise<Onboarding>) {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => invalidate(result.application.job_description, { onboardings: true }),
  })
}

export function useStartOnboarding() {
  return useOnboardingMutation((body: OnboardingCreateRequest) => startOnboarding(body))
}

export function useUpdateOnboarding() {
  return useOnboardingMutation(({ id, body }: { id: string; body: OnboardingPatch }) =>
    updateOnboarding(id, body),
  )
}

export function useCompleteOnboarding() {
  return useOnboardingMutation((id: string) => completeOnboarding(id))
}
