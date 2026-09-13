import { api, endpoints, tokenRefresher } from '@/lib/api'
import { useAuthStore, type AuthStatus } from '@/lib/auth-store'
import type {
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  ProfilePatch,
  SessionUser,
} from '@/types/domain'

/** `POST /auth/login/`: stores the access token in memory; the refresh cookie is set by the server. */
export async function login(credentials: LoginRequest): Promise<SessionUser> {
  const { data } = await api.post<AuthResponse>(endpoints.authLogin, credentials)
  useAuthStore.getState().setSession({ user: data.user, accessToken: data.access })
  return data.user
}

/**
 * Boot-time session restore: one silent `POST /auth/refresh/` through the same
 * refresher the 401 interceptor uses, so the cookie is only ever rotated once.
 * Resolves `unknown` to `authed` or `anon`; never throws.
 */
export async function restoreSession(): Promise<AuthStatus> {
  const store = useAuthStore
  try {
    const accessToken = await tokenRefresher.refresh()
    if (!store.getState().user) {
      const { data } = await api.get<SessionUser>(endpoints.authMe)
      store.getState().setSession({ user: data, accessToken })
    }
    return 'authed'
  } catch {
    store.getState().clearSession()
    return 'anon'
  }
}

/** `POST /auth/logout/` blacklists the cookie; the local session is cleared whatever the API says. */
export async function logout(): Promise<void> {
  try {
    await api.post(endpoints.authLogout)
  } catch {
    // The cookie may already be gone or the network down; signing out locally is what matters.
  } finally {
    useAuthStore.getState().clearSession()
  }
}

export async function updateProfile(patch: ProfilePatch): Promise<SessionUser> {
  const { data } = await api.patch<SessionUser>(endpoints.authMe, patch)
  useAuthStore.getState().setUser(data)
  return data
}

export async function changePassword(body: ChangePasswordRequest): Promise<void> {
  await api.post(endpoints.authChangePassword, body)
}

/** Always 202 on the server; callers show the same sentence whatever happens. */
export async function forgotPassword(email: string): Promise<void> {
  await api.post(endpoints.authForgotPassword, { email })
}
