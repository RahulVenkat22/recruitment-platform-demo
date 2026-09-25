import { create } from 'zustand'
import { api, endpoints } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { describeError } from '@/lib/errors'
import type { JobUpload } from '@/types/domain'

export type { JobUpload } from '@/types/domain'

interface UploadOperation {
  ownerId: string
  controller: AbortController
  reservation: Promise<JobUpload>
  cancelled: boolean
}

interface JobUploadState {
  ownerId: string | null
  upload: JobUpload | null
  fileName: string
  starting: boolean
  transferring: boolean
  cancelling: boolean
  progress: number
  error: string
  activate: (ownerId: string | null) => void
  start: (file: File) => Promise<void>
  refresh: () => Promise<void>
  cancel: () => Promise<void>
  dismiss: (id?: string) => Promise<void>
}

const EMPTY = {
  upload: null,
  fileName: '',
  starting: false,
  transferring: false,
  cancelling: false,
  progress: 0,
  error: '',
}

let operation: UploadOperation | null = null
let revision = 0
let pollRevision = 0

export function uploadIsActive(
  state: Pick<JobUploadState, 'upload' | 'starting' | 'transferring' | 'cancelling'>,
) {
  return (
    state.starting ||
    state.transferring ||
    state.cancelling ||
    state.upload?.status === 'uploading' ||
    state.upload?.status === 'processing'
  )
}

/** Request ownership lives outside route components. Only explicit cancellation aborts it. */
export const useJobUploadStore = create<JobUploadState>((set, get) => ({
  ...EMPTY,
  ownerId: null,

  activate(ownerId) {
    if (ownerId === get().ownerId) return
    revision += 1
    operation = null
    set({ ...EMPTY, ownerId })
  },

  async start(file) {
    const ownerId = useAuthStore.getState().user?.id
    if (!ownerId || uploadIsActive(get())) return
    get().activate(ownerId)
    revision += 1
    const currentRevision = revision
    set({ ...EMPTY, fileName: file.name, starting: true })
    const current: UploadOperation = {
      ownerId,
      controller: new AbortController(),
      cancelled: false,
      // Reserve first, so Cancel can reach the server even during file transfer.
      reservation: api
        .post<JobUpload>(endpoints.jobUploads, { file_name: file.name })
        .then(({ data }) => data),
    }
    operation = current
    const ownsState = () => currentRevision === revision && get().ownerId === ownerId
    try {
      const upload = await current.reservation
      if (current.cancelled || !ownsState()) return
      set({ upload, starting: false, transferring: true })
      const body = new FormData()
      body.append('file', file, file.name)
      const { data } = await api.post<JobUpload>(
        endpoints.jobUploadAction(upload.id, 'file'),
        body,
        {
          signal: current.controller.signal,
          onUploadProgress: (event) => {
            if (ownsState() && !current.cancelled && event.total) {
              set({ progress: Math.min(100, Math.round((event.loaded / event.total) * 100)) })
            }
          },
        },
      )
      if (ownsState() && !current.cancelled)
        set({ upload: data, transferring: false, progress: 100 })
    } catch (error) {
      if (ownsState() && !current.cancelled) {
        set({ starting: false, transferring: false, error: describeError(error) })
        // A rejected reservation may mean another tab already started an upload.
        if (!get().upload) void get().refresh()
      }
    }
  },

  async refresh() {
    const state = get()
    if (!state.ownerId || state.starting || state.transferring || state.cancelling) return
    const currentRevision = revision
    const currentPoll = ++pollRevision
    try {
      const { data } = await api.get<JobUpload[]>(endpoints.jobUploads)
      if (currentRevision !== revision || currentPoll !== pollRevision) return
      const upload = data[0] ?? null
      set({
        upload,
        fileName: upload?.file_name ?? get().fileName,
        ...(upload && upload.status !== 'uploading' ? { error: '' } : {}),
      })
    } catch (error) {
      if (currentRevision === revision && currentPoll === pollRevision && get().upload) {
        set({ error: `Unable to update upload status. ${describeError(error)}` })
      }
    }
  },

  async cancel() {
    const state = get()
    if (state.cancelling || (!state.upload && !state.starting)) return
    const ownerId = state.ownerId
    revision += 1
    const current = operation
    if (current) {
      current.cancelled = true
      current.controller.abort()
    }
    set({ cancelling: true, error: '' })
    try {
      const upload = state.upload ?? (await current?.reservation)
      if (get().ownerId !== ownerId) return
      if (upload) {
        set({ upload, starting: false, transferring: false })
        await api.post(endpoints.jobUploadAction(upload.id, 'cancel'))
      }
      if (get().ownerId === ownerId) {
        operation = null
        set(EMPTY)
      }
    } catch (error) {
      if (get().ownerId === ownerId) {
        set({
          starting: false,
          transferring: false,
          cancelling: false,
          error: `Could not confirm cancellation. ${describeError(error)}`,
        })
        if (!get().upload) void get().refresh()
      }
    }
  },

  async dismiss(id) {
    const uploadId = id ?? get().upload?.id
    const ownerId = get().ownerId
    if (uploadIsActive(get()) && (!id || id === get().upload?.id)) return
    try {
      if (uploadId) await api.post(endpoints.jobUploadAction(uploadId, 'dismiss'))
      if (get().ownerId === ownerId && (!uploadId || uploadId === get().upload?.id)) {
        revision += 1
        operation = null
        set(EMPTY)
      }
    } catch (error) {
      if (get().ownerId === ownerId) set({ error: describeError(error) })
    }
  },
}))

// Never expose one account's file names or extracted content to a different session.
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id)
    useJobUploadStore.getState().activate(state.user?.id ?? null)
})
