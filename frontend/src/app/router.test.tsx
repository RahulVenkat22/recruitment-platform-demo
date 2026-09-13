import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NAV_ITEMS } from '@/app/layout/nav'
import { api } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { UI_STORAGE_KEY, useUiStore } from '@/lib/ui-store'
import { makeUser } from '@/test/fixtures'
import { renderApp } from '@/test/render'

describe('app shell routing', () => {
  beforeEach(() => {
    localStorage.clear()
    useUiStore.setState({ sidebarCollapsed: false, breadcrumbs: [] })
    useAuthStore.setState({ user: makeUser(), accessToken: 'tok', status: 'authed' })
    vi.spyOn(api, 'get').mockRejectedValue(new Error('offline in tests'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the dashboard with every sidebar item at /dashboard', async () => {
    renderApp('/dashboard')

    // First lookup in the file pays for the lazy dashboard chunk; allow for a loaded CI box.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dashboard' }, { timeout: 10_000 }),
    ).toBeInTheDocument()

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
    useAuthStore.setState({ user: null, accessToken: null, status: 'anon' })
    renderApp('/dashboard')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome back' }),
    ).toBeInTheDocument()
  })

  it('shows the signed-in user in the sidebar and top bar', async () => {
    renderApp('/dashboard')
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })

    const sidebar = screen.getByRole('complementary')
    expect(within(sidebar).getByText('Rahul Venkat')).toBeInTheDocument()
    expect(within(sidebar).getByText('HR Manager')).toBeInTheDocument()
    // The top bar is the first header in the document; PageHeader renders a second one inside main.
    const [banner] = screen.getAllByRole('banner')
    expect(within(banner).getByRole('img', { name: 'Rahul Venkat' })).toBeInTheDocument()
    expect(within(banner).getByRole('link', { name: 'Notifications, 0 unread' })).toHaveAttribute(
      'href',
      '/notifications',
    )
  })

  it('derives breadcrumbs from the route before a page publishes its own', async () => {
    renderApp('/jobs/abc/edit')
    await screen.findByRole('heading', { level: 1, name: 'Edit Job Description' })
    const nav = screen.getByRole('navigation', { name: 'breadcrumb' })
    expect(within(nav).getByRole('link', { name: 'Job Descriptions' })).toHaveAttribute(
      'href',
      '/jobs',
    )
  })

  it('signs out through the API, clears the session and lands on the login page', async () => {
    const user = userEvent.setup()
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: null, status: 204 })
    renderApp('/dashboard')
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })

    await user.click(screen.getByRole('button', { name: 'Account menu for Rahul Venkat' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome back' }),
    ).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/v1/auth/logout/')
    expect(useAuthStore.getState()).toMatchObject({ status: 'anon', user: null })
  })
})
