import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query'
import { toQuery as toParams } from '@/features/applications/api'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type {
  JobCreateRequest,
  JobDetail,
  JobFacets,
  JobMetrics,
  JobRow,
  JobUpdateRequest,
  JobVersion,
  JobVersionDetail,
  KanbanBoard,
  Paginated,
  Participant,
  ParticipantInput,
  ParticipantRole,
  SkillSuggestion,
} from '@/types/domain'

// ------------------------------------------------------------------ list params

export interface JobListParams {
  page?: number
  page_size?: number
  search?: string
  status?: string[]
  department?: string[]
  location?: string[]
  employment_type?: string[]
  work_mode?: string[]
  mine?: boolean
  ordering?: string
}

type QueryValue = string | number | boolean

/** Drops empty values and joins list filters into the comma form the API reads. */
export function toQuery(params: JobListParams): Record<string, QueryValue> {
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

// --------------------------------------------------------------------- fetchers

export async function fetchJobs(params: JobListParams): Promise<Paginated<JobRow>> {
  const { data } = await api.get<Paginated<JobRow>>(endpoints.jobs, { params: toQuery(params) })
  return data
}

export async function fetchJob(id: string): Promise<JobDetail> {
  const { data } = await api.get<JobDetail>(endpoints.job(id))
  return data
}

export async function fetchJobFacets(): Promise<JobFacets> {
  const { data } = await api.get<JobFacets>(endpoints.jobFacets)
  return data
}

export async function fetchJobMetrics(id: string): Promise<JobMetrics> {
  const { data } = await api.get<JobMetrics>(endpoints.jobAction(id, 'metrics'))
  return data
}

export async function fetchJobVersions(id: string): Promise<JobVersion[]> {
  const { data } = await api.get<JobVersion[]>(endpoints.jobAction(id, 'versions'))
  return data
}

export async function fetchJobVersion(id: string, version: number): Promise<JobVersionDetail> {
  const { data } = await api.get<JobVersionDetail>(endpoints.jobVersion(id, version))
  return data
}

export async function fetchParticipants(id: string): Promise<Participant[]> {
  const { data } = await api.get<Participant[]>(endpoints.jobAction(id, 'participants'))
  return data
}

export async function fetchSkillSuggestions(query: string): Promise<SkillSuggestion[]> {
  const { data } = await api.get<SkillSuggestion[]>(endpoints.skills, { params: { q: query } })
  return data
}

export async function createJob(body: JobCreateRequest): Promise<JobDetail> {
  const { data } = await api.post<JobDetail>(endpoints.jobs, body)
  return data
}

export async function updateJob(id: string, body: JobUpdateRequest): Promise<JobDetail> {
  const { data } = await api.patch<JobDetail>(endpoints.job(id), body)
  return data
}

export async function deleteJob(id: string): Promise<void> {
  await api.delete(endpoints.job(id), { params: { confirm: 'true' } })
}

export type JobLifecycleAction = 'duplicate' | 'publish' | 'archive' | 'unarchive'

export async function runJobAction(id: string, action: JobLifecycleAction): Promise<JobDetail> {
  const { data } = await api.post<JobDetail>(endpoints.jobAction(id, action))
  return data
}

export async function setJobStatus(id: string, status: string, note = ''): Promise<JobDetail> {
  const { data } = await api.post<JobDetail>(endpoints.jobAction(id, 'status'), { status, note })
  return data
}

export async function addParticipants(
  id: string,
  entries: ParticipantInput[],
): Promise<Participant[]> {
  const { data } = await api.post<Participant[]>(endpoints.jobAction(id, 'participants'), entries)
  return data
}

export async function updateParticipant(
  id: string,
  participantId: string,
  role: ParticipantRole,
): Promise<Participant> {
  const { data } = await api.patch<Participant>(endpoints.jobParticipant(id, participantId), {
    role_in_recruitment: role,
  })
  return data
}

export async function removeParticipant(id: string, participantId: string): Promise<void> {
  await api.delete(endpoints.jobParticipant(id, participantId))
}

// ---------------------------------------------------------------------- queries

export function useJobList(params: JobListParams) {
  return useQuery({
    queryKey: qk.jobs.list(toQuery(params)),
    queryFn: () => fetchJobs(params),
    placeholderData: keepPreviousData,
  })
}

export interface KanbanParams {
  search?: string
  source?: string[]
  min_match?: number
  owner?: string
}

export async function fetchKanban(jobId: string, params: KanbanParams = {}): Promise<KanbanBoard> {
  const { data } = await api.get<KanbanBoard>(endpoints.jobAction(jobId, 'kanban'), {
    params: toParams(params),
  })
  return data
}

/** plan.md 9.7: the board for one JD; refetched after every pipeline mutation. */
export function useKanban(jobId: string | undefined, params: KanbanParams = {}) {
  return useQuery({
    queryKey: qk.jobs.kanban(jobId ?? '', toParams(params)),
    queryFn: () => fetchKanban(jobId as string, params),
    placeholderData: keepPreviousData,
    enabled: Boolean(jobId),
  })
}

export function useJob(id: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: qk.jobs.detail(id ?? ''),
    queryFn: () => fetchJob(id as string),
    enabled: Boolean(id) && options.enabled !== false,
  })
}

export function useJobFacets() {
  return useQuery({ queryKey: qk.jobs.facets(), queryFn: fetchJobFacets, staleTime: 60_000 })
}

export function useJobVersions(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.jobs.versions(id ?? ''),
    queryFn: () => fetchJobVersions(id as string),
    enabled: Boolean(id) && enabled,
  })
}

export function useJobVersion(id: string | undefined, version: number | null) {
  return useQuery({
    queryKey: qk.jobs.version(id ?? '', version ?? 0),
    queryFn: () => fetchJobVersion(id as string, version as number),
    enabled: Boolean(id) && version !== null,
  })
}

export function useParticipants(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: qk.jobs.participants(id ?? ''),
    queryFn: () => fetchParticipants(id as string),
    enabled: Boolean(id) && enabled,
  })
}

export function useSkillSuggestions(
  query: string,
  options: Partial<UseQueryOptions<SkillSuggestion[]>> = {},
) {
  return useQuery({
    queryKey: qk.skills.suggest(query),
    queryFn: () => fetchSkillSuggestions(query),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    ...options,
  })
}

// -------------------------------------------------------------------- mutations

/** Everything a JD mutation can make stale (plan.md 7.2). */
export function useInvalidateJob() {
  const client = useQueryClient()
  return async (id?: string) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: qk.jobs.all }),
      client.invalidateQueries({ queryKey: qk.dashboard.all }),
      id ? client.invalidateQueries({ queryKey: qk.activities.byJob(id) }) : Promise.resolve(),
    ])
  }
}

export function useCreateJob() {
  const invalidate = useInvalidateJob()
  return useMutation({
    mutationFn: (body: JobCreateRequest) => createJob(body),
    onSuccess: (job) => invalidate(job.id),
  })
}

export function useUpdateJob(id: string) {
  const client = useQueryClient()
  const invalidate = useInvalidateJob()
  return useMutation({
    mutationFn: (body: JobUpdateRequest) => updateJob(id, body),
    onSuccess: (job) => {
      client.setQueryData(qk.jobs.detail(id), job)
      return invalidate(id)
    },
  })
}

export function useDeleteJob() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteJob(id),
    onSuccess: (_result, id) =>
      Promise.all([
        // Refetch every jobs query except the deleted record's own detail, which is gone.
        client.invalidateQueries({
          queryKey: qk.jobs.all,
          predicate: (query) => !(query.queryKey[1] === 'detail' && query.queryKey[2] === id),
        }),
        client.invalidateQueries({ queryKey: qk.dashboard.all }),
      ]),
  })
}

export function useJobAction() {
  const client = useQueryClient()
  const invalidate = useInvalidateJob()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: JobLifecycleAction }) =>
      runJobAction(id, action),
    onSuccess: (job, { id, action }) => {
      if (action !== 'duplicate') client.setQueryData(qk.jobs.detail(id), job)
      return invalidate(id)
    },
  })
}

export function useSetJobStatus() {
  const client = useQueryClient()
  const invalidate = useInvalidateJob()
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: string; note?: string }) =>
      setJobStatus(id, status, note),
    onSuccess: (job, { id }) => {
      client.setQueryData(qk.jobs.detail(id), job)
      return invalidate(id)
    },
  })
}

export function useAddParticipants(id: string) {
  const invalidate = useInvalidateJob()
  return useMutation({
    mutationFn: (entries: ParticipantInput[]) => addParticipants(id, entries),
    onSuccess: () => invalidate(id),
  })
}

export function useUpdateParticipant(id: string) {
  const invalidate = useInvalidateJob()
  return useMutation({
    mutationFn: ({ participantId, role }: { participantId: string; role: ParticipantRole }) =>
      updateParticipant(id, participantId, role),
    onSuccess: () => invalidate(id),
  })
}

export function useRemoveParticipant(id: string) {
  const invalidate = useInvalidateJob()
  return useMutation({
    mutationFn: (participantId: string) => removeParticipant(id, participantId),
    onSuccess: () => invalidate(id),
  })
}
