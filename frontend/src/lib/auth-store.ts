import { create } from 'zustand'
import type { SessionUser, UserRole } from '@/types/domain'

export type { SessionUser, UserRole }

/**
 * `unknown` until the first session restore has run, then `authed` or `anon`.
 * AuthBootstrap holds the app on a splash while `unknown`, so a reload never
 * flashes the login page.
 */
export type AuthStatus = 'unknown' | 'authed' | 'anon'

export interface AuthState {
  user: SessionUser | null
  /** Kept in memory only; the refresh token lives in an httpOnly cookie. */
  accessToken: string | null
  status: AuthStatus
  setSession: (session: { user: SessionUser; accessToken: string }) => void
  setAccessToken: (accessToken: string) => void
  /** Profile edits from Settings; keeps the token and status untouched. */
  setUser: (user: SessionUser) => void
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
    setUser: (user) => set({ user }),
    clearSession: () => set({ user: null, accessToken: null, status: 'anon' }),
  }))
}

export type AuthStore = ReturnType<typeof createAuthStore>

export const useAuthStore = createAuthStore()
