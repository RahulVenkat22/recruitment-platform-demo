import { useEffect, type ReactNode } from 'react'
import { BrandSplash } from '@/components/shared/BrandSplash'
import { restoreSession } from '@/lib/auth'
import { useAuthStore } from '@/lib/auth-store'

/**
 * Runs the one silent `POST /auth/refresh/` on boot and holds the whole app on
 * the brand splash until `unknown` has become `authed` or `anon`. Sitting above
 * the router means a reload never flashes the login page for a signed-in user.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const status = useAuthStore((state) => state.status)

  useEffect(() => {
    // StrictMode runs this twice; the refresher shares one in-flight call so only one request goes out.
    if (useAuthStore.getState().status === 'unknown') void restoreSession()
  }, [])

  if (status === 'unknown') return <BrandSplash />
  return children
}
