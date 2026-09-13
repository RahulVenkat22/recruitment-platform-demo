import { AxiosError, AxiosHeaders } from 'axios'
import { api, endpoints, tokenRefresher } from '@/lib/api'
import {
  changePassword,
  forgotPassword,
  login,
  logout,
  restoreSession,
  updateProfile,
} from '@/lib/auth'
import { useAuthStore } from '@/lib/auth-store'
import { makeUser } from '@/test/fixtures'

const user = makeUser()

function axios401() {
  const config = { headers: new AxiosHeaders() }
  return new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, null, {
    status: 401,
    statusText: 'Unauthorized',
    headers: {},
    config,
    data: { error: { code: 'invalid_credentials', message: 'Incorrect email or password.' } },
  })
}

describe('auth actions', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, status: 'unknown' })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('login posts the credentials and stores the session', async () => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { access: 'tok', user }, status: 200 })

    const result = await login({
      email: 'rahul@aimious.demo',
      password: 'Demo@1234',
      remember_me: true,
    })

    expect(post).toHaveBeenCalledWith(endpoints.authLogin, {
      email: 'rahul@aimious.demo',
      password: 'Demo@1234',
      remember_me: true,
    })
    expect(result).toEqual(user)
    expect(useAuthStore.getState()).toMatchObject({ user, accessToken: 'tok', status: 'authed' })
  })

  it('login leaves the store untouched when the API rejects', async () => {
    vi.spyOn(api, 'post').mockRejectedValue(axios401())

    await expect(
      login({ email: 'x@aimious.demo', password: 'nope', remember_me: false }),
    ).rejects.toBeInstanceOf(AxiosError)

    expect(useAuthStore.getState().status).toBe('unknown')
  })

  it('restoreSession resolves to authed when the refresh cookie is valid', async () => {
    vi.spyOn(tokenRefresher, 'refresh').mockImplementation(async () => {
      useAuthStore.getState().setSession({ user, accessToken: 'fresh' })
      return 'fresh'
    })

    await expect(restoreSession()).resolves.toBe('authed')
    expect(useAuthStore.getState()).toMatchObject({ user, status: 'authed' })
  })

  it('restoreSession fetches the profile when the refresh response had no user', async () => {
    vi.spyOn(tokenRefresher, 'refresh').mockImplementation(async () => {
      useAuthStore.getState().setAccessToken('fresh')
      return 'fresh'
    })
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: user, status: 200 })

    await expect(restoreSession()).resolves.toBe('authed')
    expect(get).toHaveBeenCalledWith(endpoints.authMe)
    expect(useAuthStore.getState()).toMatchObject({ user, accessToken: 'fresh', status: 'authed' })
  })

  it('restoreSession resolves to anon and clears the store when the refresh fails', async () => {
    vi.spyOn(tokenRefresher, 'refresh').mockRejectedValue(axios401())

    await expect(restoreSession()).resolves.toBe('anon')
    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, status: 'anon' })
  })

  it('logout calls the API and clears the session even when the call fails', async () => {
    useAuthStore.getState().setSession({ user, accessToken: 'tok' })
    const post = vi.spyOn(api, 'post').mockRejectedValue(axios401())

    await logout()

    expect(post).toHaveBeenCalledWith(endpoints.authLogout)
    expect(useAuthStore.getState()).toMatchObject({ user: null, accessToken: null, status: 'anon' })
  })

  it('updateProfile patches /auth/me and replaces the stored user', async () => {
    useAuthStore.getState().setSession({ user, accessToken: 'tok' })
    const edited = { ...user, phone: '+91 90000 00000' }
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: edited, status: 200 })

    await updateProfile({ phone: '+91 90000 00000' })

    expect(patch).toHaveBeenCalledWith(endpoints.authMe, { phone: '+91 90000 00000' })
    expect(useAuthStore.getState()).toMatchObject({ user: edited, accessToken: 'tok' })
  })

  it('changePassword and forgotPassword post to their endpoints', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: null, status: 204 })

    await changePassword({ current_password: 'old', new_password: 'newer-one' })
    await forgotPassword('rahul@aimious.demo')

    expect(post).toHaveBeenNthCalledWith(1, endpoints.authChangePassword, {
      current_password: 'old',
      new_password: 'newer-one',
    })
    expect(post).toHaveBeenNthCalledWith(2, endpoints.authForgotPassword, {
      email: 'rahul@aimious.demo',
    })
  })
})
