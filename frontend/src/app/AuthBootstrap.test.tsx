import { screen } from '@testing-library/react'
import { AuthBootstrap } from '@/app/AuthBootstrap'
import { tokenRefresher } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { makeUser } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'

const user = makeUser()

describe('AuthBootstrap', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, status: 'unknown' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('holds the app on the brand splash until the silent refresh resolves, then renders it', async () => {
    let finish!: () => void
    const refresh = vi.spyOn(tokenRefresher, 'refresh').mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          finish = () => {
            useAuthStore.getState().setSession({ user, accessToken: 'fresh' })
            resolve('fresh')
          }
        }),
    )

    renderWithProviders(
      <AuthBootstrap>
        <p>Workspace</p>
      </AuthBootstrap>,
    )

    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument()
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument()

    finish()

    expect(await screen.findByText('Workspace')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(useAuthStore.getState().status).toBe('authed')
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('resolves to anon when the cookie is missing or expired and still renders the app', async () => {
    vi.spyOn(tokenRefresher, 'refresh').mockRejectedValue(new Error('401'))

    renderWithProviders(
      <AuthBootstrap>
        <p>Workspace</p>
      </AuthBootstrap>,
    )

    expect(await screen.findByText('Workspace')).toBeInTheDocument()
    expect(useAuthStore.getState()).toMatchObject({ status: 'anon', user: null, accessToken: null })
  })

  it('does not refresh again when a session is already known', async () => {
    useAuthStore.getState().setSession({ user, accessToken: 'tok' })
    const refresh = vi.spyOn(tokenRefresher, 'refresh')

    renderWithProviders(
      <AuthBootstrap>
        <p>Workspace</p>
      </AuthBootstrap>,
    )

    expect(await screen.findByText('Workspace')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })
})
