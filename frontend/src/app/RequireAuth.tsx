import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { BrandSplash } from '@/components/shared/BrandSplash'
import { useAuthStore } from '@/lib/auth-store'

/**
 * Gate for everything under the AppShell. `anon` is sent to /login with the
 * intended location in state so the login page can return there; `unknown`
 * (only reachable if AuthBootstrap is not above) holds on the splash.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)
  const location = useLocation()

  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  if (status === 'unknown') return <BrandSplash />
  return children
}
