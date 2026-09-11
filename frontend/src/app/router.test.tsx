import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NAV_ITEMS } from '@/app/layout/nav'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { UI_STORAGE_KEY, useUiStore } from '@/lib/ui-store'
import { renderApp } from '@/test/render'

describe('app shell routing', () => {
  beforeEach(() => {
    localStorage.clear()
    useUiStore.setState({ sidebarCollapsed: false, breadcrumbs: [] })
    useAuthStore.setState({ user: null, accessToken: null, status: 'unknown' })
    vi.spyOn(api, 'get').mockRejectedValue(new Error('offline in tests'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the dashboard placeholder with every sidebar item at /dashboard', async () => {
    renderApp('/dashboard')

    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Coming in phase 9.')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    for (const item of NAV_ITEMS) {
      expect(within(nav).getByRole('link', { name: item.label })).toHaveAttribute('href', item.to)
    }
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Candidates' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('shows the API health pill as offline when the health call fails', async () => {
    renderApp('/dashboard')
    expect(await screen.findByText('API offline')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('API offline')
  })

  it('redirects the root path to the dashboard', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('marks the parent nav item active on nested routes', async () => {
    renderApp('/jobs/abc/edit')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Edit Job Description' }),
    ).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: 'Job Descriptions' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('renders the not-found page for unknown paths', async () => {
    renderApp('/nowhere')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it('collapses the sidebar and remembers the choice in localStorage', async () => {
    const user = userEvent.setup()
    renderApp('/dashboard')
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(screen.getByRole('complementary')).toHaveAttribute('data-collapsed', 'true')
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeInTheDocument()
    const persisted = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}')
    expect(persisted.state.sidebarCollapsed).toBe(true)
  })

  it('sends anonymous visitors to the login page', async () => {
    useAuthStore.setState({ status: 'anon' })
    renderApp('/dashboard')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome back' }),
    ).toBeInTheDocument()
  })
})
