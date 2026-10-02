import { api, endpoints } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { makeUser } from '@/test/fixtures'
import { useJobUploadStore, type JobUpload } from './job-upload-store'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const file = new File(['file'], 'role.pdf', { type: 'application/pdf' })
export function makeUpload(status: JobUpload['status'] = 'uploading'): JobUpload {
  return {
    id: 'upload-1',
    file_name: 'role.pdf',
    status,
    fields: status === 'ready' ? { title: 'Python Developer' } : {},
    error: '',
    created_at: '2026-09-25T08:00:00Z',
    updated_at: '2026-09-25T08:00:00Z',
  }
}

beforeEach(() => {
  useJobUploadStore.getState().activate(null)
  const user = makeUser()
  useAuthStore.setState({ user, status: 'authed', accessToken: 'test' })
  useJobUploadStore.getState().activate(user.id)
  vi.spyOn(api, 'get').mockResolvedValue({ data: [] })
})

afterEach(() => {
  useJobUploadStore.getState().activate(null)
  vi.restoreAllMocks()
})

it('keeps the file and processing status outside route component lifetimes', async () => {
  const transfer = deferred<{ data: JobUpload }>()
  vi.spyOn(api, 'post')
    .mockResolvedValueOnce({ data: makeUpload() })
    .mockReturnValueOnce(transfer.promise)
  const pending = useJobUploadStore.getState().start(file)
  await vi.waitFor(() => expect(useJobUploadStore.getState().transferring).toBe(true))
  expect(useJobUploadStore.getState().fileName).toBe('role.pdf')
  transfer.resolve({ data: makeUpload('processing') })
  await pending
  expect(useJobUploadStore.getState().upload?.status).toBe('processing')
})

it('cancels before reservation finishes without ever transferring the file', async () => {
  const reservation = deferred<{ data: JobUpload }>()
  const post = vi
    .spyOn(api, 'post')
    .mockReturnValueOnce(reservation.promise)
    .mockResolvedValueOnce({ data: makeUpload('cancelled') })
  const start = useJobUploadStore.getState().start(file)
  const cancel = useJobUploadStore.getState().cancel()
  expect(useJobUploadStore.getState().cancelling).toBe(true)
  reservation.resolve({ data: makeUpload() })
  await Promise.all([start, cancel])
  expect(post).toHaveBeenCalledTimes(2)
  expect(post).toHaveBeenLastCalledWith(endpoints.jobUploadAction('upload-1', 'cancel'))
  expect(useJobUploadStore.getState().upload).toBeNull()
})

it('aborts file transfer and ignores a late response after server cancellation', async () => {
  const transfer = deferred<{ data: JobUpload }>()
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValueOnce({ data: makeUpload() })
    .mockReturnValueOnce(transfer.promise)
    .mockResolvedValueOnce({ data: makeUpload('cancelled') })
  const pending = useJobUploadStore.getState().start(file)
  await vi.waitFor(() => expect(useJobUploadStore.getState().transferring).toBe(true))
  const signal = post.mock.calls[1][2]?.signal
  await useJobUploadStore.getState().cancel()
  expect(signal?.aborted).toBe(true)
  transfer.resolve({ data: makeUpload('ready') })
  await pending
  expect(useJobUploadStore.getState().upload).toBeNull()
  expect(useJobUploadStore.getState().fileName).toBe('')
})

it('ignores a late status poll after cancellation', async () => {
  useJobUploadStore.setState({ upload: makeUpload('processing'), fileName: 'role.pdf' })
  const poll = deferred<{ data: JobUpload[] }>()
  vi.mocked(api.get).mockReturnValueOnce(poll.promise)
  vi.spyOn(api, 'post').mockResolvedValue({ data: makeUpload('cancelled') })
  const refresh = useJobUploadStore.getState().refresh()
  await useJobUploadStore.getState().cancel()
  poll.resolve({ data: [makeUpload('ready')] })
  await refresh
  expect(useJobUploadStore.getState().upload).toBeNull()
})

it('keeps cancellation errors visible and lets the user retry cancellation', async () => {
  useJobUploadStore.setState({ upload: makeUpload('processing'), fileName: 'role.pdf' })
  vi.spyOn(api, 'post')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ data: makeUpload('cancelled') })
  await useJobUploadStore.getState().cancel()
  expect(useJobUploadStore.getState().upload?.status).toBe('processing')
  expect(useJobUploadStore.getState().error).toContain('Could not confirm cancellation')
  await useJobUploadStore.getState().cancel()
  expect(useJobUploadStore.getState().upload).toBeNull()
})

it('restores a completed extraction from the server for review', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: [makeUpload('ready')] })
  await useJobUploadStore.getState().refresh()
  expect(useJobUploadStore.getState().upload?.fields.title).toBe('Python Developer')
  expect(useJobUploadStore.getState().fileName).toBe('role.pdf')
})

it('does not expose a previous user’s upload after switching accounts', async () => {
  const poll = deferred<{ data: JobUpload[] }>()
  vi.mocked(api.get).mockReturnValueOnce(poll.promise)
  const refresh = useJobUploadStore.getState().refresh()
  useAuthStore.setState({ user: makeUser({ id: 'another-user' }) })
  poll.resolve({ data: [makeUpload('ready')] })
  await refresh
  expect(useJobUploadStore.getState().upload).toBeNull()
  expect(useJobUploadStore.getState().fileName).toBe('')
})

it('does not dismiss an active upload without cancellation', async () => {
  useJobUploadStore.setState({ upload: makeUpload('processing') })
  const post = vi.spyOn(api, 'post')
  await useJobUploadStore.getState().dismiss()
  expect(post).not.toHaveBeenCalled()
  expect(useJobUploadStore.getState().upload?.status).toBe('processing')
})
