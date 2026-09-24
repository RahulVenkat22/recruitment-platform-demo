import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import SettingsPage from '@/features/settings/SettingsPage'
import { api, endpoints } from '@/lib/api'
import { useAuthStore } from '@/lib/auth-store'
import { UI_STORAGE_KEY, useUiStore } from '@/lib/ui-store'
import { makeAxiosError, makeUser } from '@/test/fixtures'
import { renderWithProviders } from '@/test/render'
import type { SessionUser } from '@/types/domain'

function renderSettings(user: SessionUser, route = '/settings') {
  useAuthStore.getState().setSession({ user, accessToken: 'tok' })
  return renderWithProviders(
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>,
    { route },
  )
}

describe('SettingsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    useUiStore.setState({
      sidebarCollapsed: false,
      pageSize: 20,
      motionEffects: true,
      breadcrumbs: [],
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    useAuthStore.setState({ user: null, accessToken: null, status: 'unknown' })
  })

  it('persists the animation preference and applies it to the workspace', async () => {
    const ui = userEvent.setup()
    renderSettings(makeUser(), '/settings?tab=preferences')
    const toggle = screen.getByRole('switch', { name: 'Interface animations' })
    expect(toggle).toBeChecked()
    await ui.click(toggle)
    expect(toggle).not.toBeChecked()
    expect(document.documentElement).toHaveAttribute('data-motion', 'reduced')
    const saved = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}')
    expect(saved.state.motionEffects).toBe(false)
    await ui.click(toggle)
    expect(document.documentElement).toHaveAttribute('data-motion', 'full')
  })

  it('shows the profile form with read-only designation and department', () => {
    renderSettings(makeUser())

    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByLabelText('First name')).toHaveValue('Rahul')
    expect(screen.getByLabelText('Last name')).toHaveValue('Venkat')
    expect(screen.getByLabelText('Designation')).toHaveValue('HR Manager')
    expect(screen.getByLabelText('Designation')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Department')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Phone')).toHaveValue('+91 98400 11001')
    expect(screen.getByRole('img', { name: 'Rahul Venkat' })).toHaveTextContent('RV')
  })

  it('previews initials live while the avatar URL is empty', async () => {
    const ui = userEvent.setup()
    renderSettings(makeUser())

    await ui.clear(screen.getByLabelText('Last name'))
    await ui.type(screen.getByLabelText('Last name'), 'Kumar')

    expect(screen.getByRole('img', { name: 'Rahul Kumar' })).toHaveTextContent('RK')

    await ui.type(screen.getByLabelText('Avatar URL'), 'https://example.test/rahul.jpg')
    expect(screen.getByRole('img', { name: 'Rahul Kumar' }).tagName).toBe('IMG')
  })

  it('saves the profile through PATCH /auth/me/ and updates the session', async () => {
    const ui = userEvent.setup()
    const saved = makeUser({ phone: '+91 90000 00000' })
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: saved, status: 200 })
    renderSettings(makeUser())

    await ui.clear(screen.getByLabelText('Phone'))
    await ui.type(screen.getByLabelText('Phone'), '+91 90000 00000')
    await ui.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Profile saved')).toBeInTheDocument()
    expect(patch).toHaveBeenCalledWith(endpoints.authMe, {
      first_name: 'Rahul',
      last_name: 'Venkat',
      phone: '+91 90000 00000',
      avatar_url: null,
      timezone: 'Asia/Kolkata',
    })
    expect(useAuthStore.getState().user).toEqual(saved)
  })

  it('maps server field errors onto the profile form', async () => {
    const ui = userEvent.setup()
    vi.spyOn(api, 'patch').mockRejectedValue(
      makeAxiosError(400, {
        code: 'validation_error',
        message: 'Invalid input.',
        details: { phone: ['Enter a valid phone number.'] },
      }),
    )
    renderSettings(makeUser())

    await ui.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Enter a valid phone number.')).toBeInTheDocument()
  })

  it('validates the change password form and maps a wrong current password', async () => {
    const ui = userEvent.setup()
    const post = vi.spyOn(api, 'post').mockRejectedValue(
      makeAxiosError(400, {
        code: 'validation_error',
        message: 'Invalid input.',
        details: { current_password: ['Wrong password.'] },
      }),
    )
    renderSettings(makeUser(), '/settings?tab=security')

    await ui.type(screen.getByLabelText('Current password'), 'old-pass-1')
    await ui.type(screen.getByLabelText('New password'), 'new-pass-123')
    await ui.type(screen.getByLabelText('Confirm new password'), 'different')
    await ui.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument()
    expect(post).not.toHaveBeenCalled()

    await ui.clear(screen.getByLabelText('Confirm new password'))
    await ui.type(screen.getByLabelText('Confirm new password'), 'new-pass-123')
    await ui.click(screen.getByRole('button', { name: 'Update password' }))

    expect(await screen.findByText('Wrong password.')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith(endpoints.authChangePassword, {
      current_password: 'old-pass-1',
      new_password: 'new-pass-123',
    })
  })

  it('stores preferences in localStorage', async () => {
    const ui = userEvent.setup()
    renderSettings(makeUser(), '/settings?tab=preferences')

    await ui.click(screen.getByRole('radio', { name: '50' }))
    await ui.click(screen.getByRole('switch', { name: 'Start with the sidebar collapsed' }))

    expect(useUiStore.getState()).toMatchObject({ pageSize: 50, sidebarCollapsed: true })
    const persisted = JSON.parse(localStorage.getItem(UI_STORAGE_KEY) ?? '{}')
    expect(persisted.state).toMatchObject({ pageSize: 50, sidebarCollapsed: true })
  })

  it('hides the Users tab from everyone but HR admins', () => {
    renderSettings(makeUser({ role: 'hr' }))
    expect(screen.queryByRole('tab', { name: 'Users' })).not.toBeInTheDocument()
  })

  it('lists users read-only for HR admins', async () => {
    const ui = userEvent.setup()
    vi.spyOn(api, 'get').mockResolvedValue({
      status: 200,
      data: {
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            id: 'u1',
            email: 'rahul@aimious.demo',
            first_name: 'Rahul',
            last_name: 'Venkat',
            full_name: 'Rahul Venkat',
            designation: 'HR Manager',
            department: 'Human Resources',
            role: 'hr_admin',
            avatar_url: null,
            initials: 'RV',
            is_active: true,
          },
          {
            id: 'u5',
            email: 'arun@aimious.demo',
            first_name: 'Arun',
            last_name: 'Kumar',
            full_name: 'Arun Kumar',
            designation: 'Engineering Manager',
            department: 'Engineering',
            role: 'interviewer',
            avatar_url: null,
            initials: 'AK',
            is_active: true,
          },
        ],
      },
    })
    renderSettings(makeUser())

    await ui.click(screen.getByRole('tab', { name: 'Users' }))

    const table = await screen.findByRole('table')
    expect(within(table).getByText('Arun Kumar')).toBeInTheDocument()
    expect(within(table).getByText('Interviewer')).toBeInTheDocument()
    expect(within(table).getByText('arun@aimious.demo')).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(3)
  })
})
