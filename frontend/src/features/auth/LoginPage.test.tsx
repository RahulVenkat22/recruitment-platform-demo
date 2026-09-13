import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, type InitialEntry } from 'react-router'
import LoginPage from '@/features/auth/LoginPage'
import { api, endpoints } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { makeAxiosError, makeNetworkError, makeUser } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'

const user = makeUser()

function renderLogin(route: InitialEntry = '/login') {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<p>Dashboard page</p>} />
      <Route path="/jobs/:id" element={<p>Job detail page</p>} />
    </Routes>,
    { route },
  )
}

async function fillAndSubmit(
  ui: ReturnType<typeof userEvent.setup>,
  email: string,
  password: string,
) {
  await ui.type(screen.getByLabelText('Email or username'), email)
  await ui.type(screen.getByLabelText('Password'), password)
  await ui.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('LoginPage', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, status: 'anon' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the two-panel layout copy', () => {
    renderLogin()
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument()
    expect(screen.getByText('AI-powered recruitment intelligence')).toBeInTheDocument()
    expect(screen.getByLabelText('Remember me')).not.toBeChecked()
  })

  it('validates required fields before calling the API', async () => {
    const ui = userEvent.setup()
    const post = vi.spyOn(api, 'post')
    renderLogin()

    await ui.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText('Enter your email or username')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
    expect(screen.getByLabelText('Email or username')).toHaveAttribute('aria-invalid', 'true')
    expect(post).not.toHaveBeenCalled()
  })

  it('checks the email format only when the identifier contains an @', async () => {
    const ui = userEvent.setup()
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { access: 't', user }, status: 200 })
    renderLogin()

    await fillAndSubmit(ui, 'rahul@', 'Demo@1234')
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    await ui.clear(screen.getByLabelText('Email or username'))
    await ui.type(screen.getByLabelText('Email or username'), 'rahul')
    await ui.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(post).toHaveBeenCalledWith(endpoints.authLogin, {
      email: 'rahul',
      password: 'Demo@1234',
      remember_me: false,
    })
  })

  it('shows the rose alert and shakes the form on wrong credentials', async () => {
    const ui = userEvent.setup()
    vi.spyOn(api, 'post').mockRejectedValue(
      makeAxiosError(401, { code: 'invalid_credentials', message: 'Incorrect email or password.' }),
    )
    renderLogin()

    await fillAndSubmit(ui, 'rahul@aimious.demo', 'wrong')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Incorrect email or password.')
    expect(screen.getByRole('form', { name: 'Sign in' })).toHaveAttribute('data-shake', 'true')
    expect(useAuthStore.getState().status).toBe('anon')
  })

  it('shows a distinct message when throttled', async () => {
    const ui = userEvent.setup()
    vi.spyOn(api, 'post').mockRejectedValue(makeAxiosError(429, { code: 'throttled' }))
    renderLogin()

    await fillAndSubmit(ui, 'rahul@aimious.demo', 'Demo@1234')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts, try again in a minute.',
    )
    expect(screen.getByRole('form', { name: 'Sign in' })).not.toHaveAttribute('data-shake')
  })

  it('explains a network failure', async () => {
    const ui = userEvent.setup()
    vi.spyOn(api, 'post').mockRejectedValue(makeNetworkError())
    renderLogin()

    await fillAndSubmit(ui, 'rahul@aimious.demo', 'Demo@1234')

    expect(await screen.findByRole('alert')).toHaveTextContent("Can't reach the server")
  })

  it('signs in with remember me and returns to the page the visitor wanted', async () => {
    const ui = userEvent.setup()
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { access: 'tok', user }, status: 200 })
    renderLogin({ pathname: '/login', state: { from: { pathname: '/jobs/42' } } })

    await ui.click(screen.getByLabelText('Remember me'))
    await fillAndSubmit(ui, 'rahul@aimious.demo', 'Demo@1234')

    expect(await screen.findByText('Job detail page')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith(endpoints.authLogin, {
      email: 'rahul@aimious.demo',
      password: 'Demo@1234',
      remember_me: true,
    })
    expect(useAuthStore.getState()).toMatchObject({ user, accessToken: 'tok', status: 'authed' })
  })

  it('goes to the dashboard by default after signing in', async () => {
    const ui = userEvent.setup()
    vi.spyOn(api, 'post').mockResolvedValue({ data: { access: 'tok', user }, status: 200 })
    renderLogin()

    await fillAndSubmit(ui, 'rahul@aimious.demo', 'Demo@1234')

    expect(await screen.findByText('Dashboard page')).toBeInTheDocument()
  })

  it('sends already signed-in users straight to the dashboard', () => {
    useAuthStore.getState().setSession({ user, accessToken: 'tok' })
    renderLogin()
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).not.toBeInTheDocument()
  })

  it('fills the form from the demo accounts list', async () => {
    const ui = userEvent.setup()
    renderLogin()

    await ui.click(screen.getByRole('button', { name: 'Demo accounts' }))
    const list = await screen.findByRole('list', { name: 'Demo accounts' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    await ui.click(within(list).getByRole('button', { name: /Priya Sharma/ }))

    expect(screen.getByLabelText('Email or username')).toHaveValue('priya@aimious.demo')
    expect(screen.getByLabelText('Password')).toHaveValue('Demo@1234')
  })

  it('toggles password visibility', async () => {
    const ui = userEvent.setup()
    renderLogin()

    const password = screen.getByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await ui.click(screen.getByRole('button', { name: 'Show password' }))
    expect(password).toHaveAttribute('type', 'text')
    await ui.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('opens the forgot password dialog and always shows the same confirmation', async () => {
    const ui = userEvent.setup()
    const post = vi.spyOn(api, 'post').mockRejectedValue(makeAxiosError(500))
    renderLogin()

    await ui.type(screen.getByLabelText('Email or username'), 'rahul@aimious.demo')
    await ui.click(screen.getByRole('button', { name: 'Forgot password?' }))

    const dialog = await screen.findByRole('dialog', { name: 'Reset your password' })
    expect(within(dialog).getByLabelText('Email')).toHaveValue('rahul@aimious.demo')
    await ui.click(within(dialog).getByRole('button', { name: 'Send reset link' }))

    expect(
      await within(dialog).findByText('If an account exists, a reset link has been sent.'),
    ).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith(endpoints.authForgotPassword, { email: 'rahul@aimious.demo' })
  })
})
