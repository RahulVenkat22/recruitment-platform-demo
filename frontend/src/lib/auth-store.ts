import { create } from 'zustand'

export type UserRole = 'hr_admin' | 'hr' | 'interviewer' | 'employee'

/** The profile returned by `POST /auth/login` and `GET /auth/me`. */
export interface SessionUser {
  id: string
  email: string
  first_name: string
  last_name: string
  designation: string
  department: string
  avatar_url: string | null
  role: UserRole
  timezone?: string
}

/**
 * `unknown` until the first session restore has run, then `authed` or `anon`.
 * RequireAuth passes `unknown` through so a reload never flashes the login page.
 */
export type AuthStatus = 'unknown' | 'authed' | 'anon'

export interface AuthState {
  user: SessionUser | null
  /** Kept in memory only; the refresh token lives in an httpOnly cookie. */
  accessToken: string | null
  status: AuthStatus
  setSession: (session: { user: SessionUser; accessToken: string }) => void
  setAccessToken: (accessToken: string) => void
  clearSession: () => void
}

export function createAuthStore() {
  return create<AuthState>()((set) => ({
    user: null,
    accessToken: null,
    status: 'unknown',
    setSession: ({ user, accessToken }) => set({ user, accessToken, status: 'authed' }),
    setAccessToken: (accessToken) =>
      set((state) => ({ accessToken, status: state.user ? 'authed' : state.status })),
    clearSession: () => set({ user: null, accessToken: null, status: 'anon' }),
  }))
}

export type AuthStore = ReturnType<typeof createAuthStore>

export const useAuthStore = createAuthStore()
