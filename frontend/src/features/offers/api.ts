import { useMutation, useQuery } from '@tanstack/react-query'
import { toQuery, useInvalidatePipeline } from '@/features/applications/api'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type { Offer, OfferCreateRequest, OfferPatch, Paginated } from '@/types/domain'

export type OfferAction = 'send' | 'accept' | 'decline' | 'withdraw'

export interface OfferListParams {
  page?: number
  page_size?: number
  application?: string
  job_description?: string
  candidate?: string
  status?: string[]
}

export async function fetchOffers(params: OfferListParams): Promise<Paginated<Offer>> {
  const { data } = await api.get<Paginated<Offer>>(endpoints.offers, { params: toQuery(params) })
  return data
}

export async function createOffer(body: OfferCreateRequest): Promise<Offer> {
  const { data } = await api.post<Offer>(endpoints.offers, body)
  return data
}

export async function updateOffer(id: string, body: OfferPatch): Promise<Offer> {
  const { data } = await api.patch<Offer>(endpoints.offer(id), body)
  return data
}

export async function actOnOffer(
  id: string,
  action: OfferAction,
  text: { reason?: string; note?: string } = {},
): Promise<Offer> {
  const { data } = await api.post<Offer>(endpoints.offerAction(id, action), text)
  return data
}

export function useOffers(params: OfferListParams, enabled = true) {
  return useQuery({
    queryKey: qk.offers.list(toQuery(params)),
    queryFn: () => fetchOffers(params),
    enabled,
  })
}

function useOfferMutation<TInput>(run: (input: TInput) => Promise<Offer>) {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: run,
    onSuccess: (result) => invalidate(result.application.job_description, { offers: true }),
  })
}

export function useCreateOffer() {
  return useOfferMutation((body: OfferCreateRequest) => createOffer(body))
}

export function useUpdateOffer() {
  return useOfferMutation(({ id, body }: { id: string; body: OfferPatch }) => updateOffer(id, body))
}

export function useOfferAction() {
  return useOfferMutation(
    ({
      id,
      action,
      reason,
      note,
    }: {
      id: string
      action: OfferAction
      reason?: string
      note?: string
    }) => actOnOffer(id, action, { reason, note }),
  )
}
