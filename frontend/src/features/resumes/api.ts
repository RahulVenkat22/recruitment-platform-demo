import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type { IntakeResult, UploadBatch, UploadBatchSummary } from '@/types/domain'

/** `POST /resumes/uploads/`: any number of PDFs in one multipart request. */
export async function uploadResumes(files: File[]): Promise<IntakeResult> {
  const body = new FormData()
  for (const file of files) body.append('files', file, file.name)
  const { data } = await api.post<IntakeResult>(endpoints.resumeUploads, body)
  return data
}

export async function fetchUploadBatch(id: string): Promise<UploadBatch> {
  const { data } = await api.get<UploadBatch>(endpoints.resumeUploadBatch(id))
  return data
}

export async function fetchUploadBatches(limit = 10): Promise<UploadBatchSummary[]> {
  const { data } = await api.get<UploadBatchSummary[]>(endpoints.resumeUploads, {
    params: { limit },
  })
  return data
}

/** True once every file of the batch has a final status and no worker is on it. */
export function isBatchFinished(batch: UploadBatch | null | undefined): boolean {
  return Boolean(batch && !batch.running && batch.done >= batch.total)
}

/** Polls the batch every `pollMs` while the worker is still processing it. */
export function useUploadBatch(id: string | undefined, pollMs = 2000) {
  return useQuery({
    queryKey: qk.resumes.batch(id ?? ''),
    queryFn: () => fetchUploadBatch(id as string),
    enabled: Boolean(id),
    refetchInterval: (query) => (isBatchFinished(query.state.data) ? false : pollMs),
    refetchIntervalInBackground: true,
    staleTime: 0,
  })
}

export function useUploadBatches() {
  return useQuery({ queryKey: qk.resumes.batches(), queryFn: () => fetchUploadBatches(10) })
}

export function useUploadResumes() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (files: File[]) => uploadResumes(files),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.resumes.all }),
  })
}

/** Refresh candidates and sources once a batch has landed people in the library. */
export function useInvalidateAfterUpload() {
  const client = useQueryClient()
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: qk.candidates.all }),
      client.invalidateQueries({ queryKey: qk.sources.all }),
      client.invalidateQueries({ queryKey: qk.resumes.all }),
    ])
  }
}
