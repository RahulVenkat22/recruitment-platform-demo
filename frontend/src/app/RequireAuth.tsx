import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuthStore } from '@/lib/auth-store'

/**
 * Gate for everything under the AppShell. Only an explicit `anon` status redirects;
 * `unknown` passes through so a reload never flashes the login page. Phase 2 adds
 * the session restore that resolves `unknown`.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)
  const location = useLocation()

  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return children
}
