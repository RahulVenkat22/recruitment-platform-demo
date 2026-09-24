import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  Paginated,
  TicketCreateRequest,
  TicketDetail,
  TicketPatch,
  TicketRow,
  TicketStatus,
  TicketSummary,
} from '@/types/domain'

export interface TicketListParams {
  page?: number
  page_size?: number
  search?: string
  status?: string[]
  priority?: string[]
  category?: string[]
  mine?: boolean
  assigned_to_me?: boolean
  ordering?: string
}

export type TicketSummaryParams = Pick<TicketListParams, 'mine' | 'assigned_to_me'>

type QueryValue = string | number | boolean

/** Drops empty values and joins list filters into the comma form the API reads. */
function toQuery(params: TicketListParams): Record<string, QueryValue> {
  const query: Record<string, QueryValue> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    if (Array.isArray(value)) {
      if (value.length > 0) query[key] = value.join(',')
      continue
    }
    query[key] = value as QueryValue
  }
  return query
}

export async function fetchTickets(params: TicketListParams): Promise<Paginated<TicketRow>> {
  const { data } = await api.get<Paginated<TicketRow>>(endpoints.tickets, {
    params: toQuery(params),
  })
  return data
}

export async function fetchTicket(id: string): Promise<TicketDetail> {
  const { data } = await api.get<TicketDetail>(endpoints.ticket(id))
  return data
}

export async function fetchTicketSummary(params: TicketSummaryParams): Promise<TicketSummary> {
  const { data } = await api.get<TicketSummary>(endpoints.ticketsSummary, {
    params: toQuery(params),
  })
  return data
}

export function useTickets(params: TicketListParams) {
  return useQuery({
    queryKey: qk.support.list(toQuery(params)),
    queryFn: () => fetchTickets(params),
    placeholderData: keepPreviousData,
  })
}

export function useTicketSummary(params: TicketSummaryParams) {
  return useQuery({
    queryKey: qk.support.summary(toQuery(params)),
    queryFn: () => fetchTicketSummary(params),
    placeholderData: keepPreviousData,
  })
}

export function useTicket(id: string | undefined) {
  return useQuery({
    queryKey: qk.support.detail(id ?? ''),
    queryFn: () => fetchTicket(id ?? ''),
    enabled: Boolean(id),
  })
}

/** Every change touches the list, the ticket and (through the service) someone's notifications. */
function useInvalidateSupport() {
  const client = useQueryClient()
  return (ticket?: TicketDetail) => {
    if (ticket) client.setQueryData(qk.support.detail(ticket.id), ticket)
    void client.invalidateQueries({ queryKey: qk.support.all })
    void client.invalidateQueries({ queryKey: qk.notifications.all })
  }
}

type TicketBody = Omit<TicketCreateRequest, 'attachments'>

/** Files only travel as multipart; without any, the body goes as JSON as before. */
function withFiles(
  body: Record<string, unknown>,
  attachments: readonly File[],
): FormData | Record<string, unknown> {
  if (attachments.length === 0) return body
  const form = new FormData()
  for (const [key, value] of Object.entries(body)) {
    form.append(key, value === null || value === undefined ? '' : String(value))
  }
  for (const file of attachments) form.append('attachments', file, file.name)
  return form
}

export function useCreateTicket() {
  const invalidate = useInvalidateSupport()
  return useMutation({
    mutationFn: async ({ body, attachments = [] }: { body: TicketBody; attachments?: File[] }) => {
      const { data } = await api.post<TicketDetail>(endpoints.tickets, withFiles(body, attachments))
      return data
    },
    onSuccess: (ticket) => invalidate(ticket),
  })
}

export function useUpdateTicket() {
  const invalidate = useInvalidateSupport()
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: TicketPatch }) => {
      const { data } = await api.patch<TicketDetail>(endpoints.ticket(id), body)
      return data
    },
    onSuccess: (ticket) => invalidate(ticket),
  })
}

export function useCommentTicket() {
  const invalidate = useInvalidateSupport()
  return useMutation({
    mutationFn: async ({
      id,
      message,
      attachments = [],
    }: {
      id: string
      message: string
      attachments?: File[]
    }) => {
      const { data } = await api.post<TicketDetail>(
        endpoints.ticketAction(id, 'comments'),
        withFiles({ message }, attachments),
      )
      return data
    },
    onSuccess: (ticket) => invalidate(ticket),
  })
}

export function useTransitionTicket() {
  const invalidate = useInvalidateSupport()
  return useMutation({
    mutationFn: async ({
      id,
      status,
      note,
    }: {
      id: string
      status: TicketStatus
      note?: string
    }) => {
      const { data } = await api.post<TicketDetail>(endpoints.ticketAction(id, 'transition'), {
        status,
        note: note ?? '',
      })
      return data
    },
    onSuccess: (ticket) => invalidate(ticket),
  })
}

export function useAssignTicket() {
  const invalidate = useInvalidateSupport()
  return useMutation({
    mutationFn: async ({ id, assigneeId }: { id: string; assigneeId: string | null }) => {
      const { data } = await api.post<TicketDetail>(endpoints.ticketAction(id, 'assign'), {
        assignee_id: assigneeId,
      })
      return data
    },
    onSuccess: (ticket) => invalidate(ticket),
  })
}
