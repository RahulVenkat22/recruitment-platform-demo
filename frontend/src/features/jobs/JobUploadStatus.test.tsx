import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Route, Routes, useLocation } from 'react-router'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { makeUser } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'
import { JobUploadStatus } from './JobUploadStatus'
import { JobUploadPanel } from './JobUploadPanel'
import { useJobUploadStore, type JobUpload } from './job-upload-store'

function Review() {
  const { state } = useLocation()
  return <h1>Review: {state?.prefill?.title}</h1>
}

beforeEach(() => {
  useJobUploadStore.getState().activate(null)
  useAuthStore.setState({ user: makeUser(), status: 'authed', accessToken: 'test' })
})

afterEach(() => {
  useJobUploadStore.getState().activate(null)
  vi.restoreAllMocks()
})

it('shows progress on another page, preserves the finished upload, and only opens review on click', async () => {
  const user = userEvent.setup()
  let serverUpload: JobUpload | null = null
  vi.spyOn(api, 'get').mockImplementation(async () => ({
    data: serverUpload ? [serverUpload] : [],
  }))
  vi.spyOn(api, 'post').mockImplementation(async (url) => {
    if (String(url).endsWith('/file/')) {
      serverUpload = { ...serverUpload!, status: 'processing' }
    } else {
      serverUpload = {
        id: 'upload-1',
        file_name: 'role.pdf',
        status: 'uploading',
        fields: {},
        error: '',
        created_at: '',
        updated_at: '',
      }
    }
    return { data: serverUpload }
  })
  const { container } = renderWithProviders(
    <>
      <JobUploadStatus />
      <Link to="/elsewhere">Switch page</Link>
      <Routes>
        <Route path="/jobs" element={<JobUploadPanel />} />
        <Route path="/elsewhere" element={<h1>Other page</h1>} />
        <Route path="/jobs/new" element={<Review />} />
      </Routes>
    </>,
    { route: '/jobs' },
  )
  await user.upload(
    container.querySelector('input[type="file"]')!,
    new File(['pdf'], 'role.pdf', { type: 'application/pdf' }),
  )
  const banner = await screen.findByRole('region', { name: 'Job description upload' })
  await user.click(screen.getByRole('link', { name: 'Switch page' }))
  expect(screen.getByRole('heading', { name: 'Other page' })).toBeInTheDocument()
  expect(within(banner).getByText('role.pdf')).toBeInTheDocument()
  expect(within(banner).getByRole('button', { name: 'Cancel upload' })).toBeInTheDocument()
  serverUpload = { ...serverUpload!, status: 'ready', fields: { title: 'Python Developer' } }
  await act(() => useJobUploadStore.getState().refresh())
  expect(screen.getByRole('heading', { name: 'Other page' })).toBeInTheDocument()
  await user.click(within(banner).getByRole('link', { name: 'Review job description' }))
  expect(screen.getByRole('heading', { name: 'Review: Python Developer' })).toBeInTheDocument()
})
