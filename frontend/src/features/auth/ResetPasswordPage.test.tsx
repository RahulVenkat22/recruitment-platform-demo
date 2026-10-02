import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api } from '@/lib/api'
import { renderWithProviders } from '@/test/render'
import ResetPasswordPage from './ResetPasswordPage'

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

it('completes the reset and removes its token from browser history', async () => {
  window.history.replaceState(null, '', '/reset-password#token=reset-test-token')
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} })
  renderWithProviders(<ResetPasswordPage />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New password'), 'New-password-123!')
  await user.type(screen.getByLabelText('Confirm password'), 'New-password-123!')
  await user.click(screen.getByRole('button', { name: 'Set password' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Your password has been updated.')
  expect(post).toHaveBeenCalledWith('/api/v1/auth/reset-password/', {
    token: 'reset-test-token',
    new_password: 'New-password-123!',
  })
  expect(window.location.hash).toBe('')
})

it('rejects mismatched confirmation without sending a request', async () => {
  window.history.replaceState(null, '', '/reset-password#token=reset-test-token')
  const post = vi.spyOn(api, 'post')
  renderWithProviders(<ResetPasswordPage />)
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('New password'), 'New-password-123!')
  await user.type(screen.getByLabelText('Confirm password'), 'Different-password-123!')
  await user.click(screen.getByRole('button', { name: 'Set password' }))
  expect(screen.getByRole('alert')).toHaveTextContent('The passwords do not match.')
  expect(post).not.toHaveBeenCalled()
})
