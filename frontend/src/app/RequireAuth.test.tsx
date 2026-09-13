import { screen } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router'
import { RequireAuth } from '@/app/RequireAuth'
import { useAuthStore } from '@/lib/auth-store'
import { makeUser } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'

function LoginProbe() {
  const location = useLocation()
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
  return <p>Login page, from {from ?? 'nowhere'}</p>
}

function renderGate(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginProbe />} />
      <Route
        path="/jobs/:id"
        element={
          <RequireAuth>
            <p>Private job page</p>
          </RequireAuth>
        }
      />
    </Routes>,
    { route },
  )
}

describe('RequireAuth', () => {
  afterEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, status: 'unknown' })
  })

  it('redirects anonymous visitors to /login and remembers where they were going', () => {
    useAuthStore.setState({ status: 'anon' })
    renderGate('/jobs/42')
    expect(screen.getByText('Login page, from /jobs/42')).toBeInTheDocument()
  })

  it('renders the protected page for an authenticated user', () => {
    useAuthStore.getState().setSession({ user: makeUser(), accessToken: 'tok' })
    renderGate('/jobs/42')
    expect(screen.getByText('Private job page')).toBeInTheDocument()
  })

  it('shows the splash rather than the page while the session is still unknown', () => {
    useAuthStore.setState({ status: 'unknown' })
    renderGate('/jobs/42')
    expect(screen.getByRole('status', { name: 'Restoring your session' })).toBeInTheDocument()
    expect(screen.queryByText('Private job page')).not.toBeInTheDocument()
    expect(screen.queryByText(/Login page/)).not.toBeInTheDocument()
  })
})
