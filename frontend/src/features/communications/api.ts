import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { toQuery, useInvalidatePipeline } from '@/features/applications/api'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  BulkEmailRequest,
  BulkEmailResult,
  Communication,
  CommunicationCreateRequest,
  EmailConfig,
  EmailPreview,
  EmailSendRequest,
  Paginated,
} from '@/types/domain'

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

export async function fetchEmailConfig(): Promise<EmailConfig> {
  const { data } = await api.get<EmailConfig>(endpoints.emailConfig)
  return data
}

export async function previewEmail(
  applicationId: string,
  templateId: string,
): Promise<EmailPreview> {
  const { data } = await api.post<EmailPreview>(endpoints.applicationEmailPreview(applicationId), {
    template_id: templateId,
  })
  return data
}

export async function sendEmail(
  applicationId: string,
  body: EmailSendRequest,
): Promise<Communication> {
  const { data } = await api.post<Communication>(
    endpoints.applicationAction(applicationId, 'email'),
    body,
  )
  return data
}

export async function sendBulkEmail(body: BulkEmailRequest): Promise<BulkEmailResult> {
  const { data } = await api.post<BulkEmailResult>(endpoints.applicationsBulkEmail, body)
  return data
}

/** Whether mail is configured, the sender, safe mode and the templates; changes rarely. */
export function useEmailConfig() {
  return useQuery({ queryKey: qk.email.config(), queryFn: fetchEmailConfig, staleTime: 60_000 })
}

/** The template rendered for one candidate. A POST, but read-only, so a query fits. */
export function useEmailPreview(applicationId: string, templateId: string) {
  return useQuery({
    queryKey: qk.email.preview(applicationId, templateId),
    queryFn: () => previewEmail(applicationId, templateId),
    enabled: templateId.length > 0,
    staleTime: 60_000,
  })
}

export function useSendEmail() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: ({ id, ...body }: EmailSendRequest & { id: string }) => sendEmail(id, body),
    onSuccess: (result) => invalidate(result.application.job_description, { communications: true }),
  })
}

export function useBulkEmail() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: (body: BulkEmailRequest) => sendBulkEmail(body),
    onSuccess: () => invalidate(undefined, { communications: true }),
  })
}

export function useLogCommunication() {
  const invalidate = useInvalidatePipeline()
  return useMutation({
    mutationFn: (body: CommunicationCreateRequest) => logCommunication(body),
    onSuccess: (result) => invalidate(result.application.job_description, { communications: true }),
  })
}
