import type { ReactNode } from 'react'
import { Navigate } from 'react-router'
import { useAuthStore } from '@/lib/auth-store'
import type { UserRole } from '@/types/domain'

/**
 * Gate for pages that only some roles get (the dashboard is HR's view). Anyone
 * else lands on the homepage instead of an error, since the sidebar never
 * offered them the page in the first place.
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: readonly UserRole[]
  children: ReactNode
}) {
  const role = useAuthStore((state) => state.user?.role)
  if (!role || !roles.includes(role)) return <Navigate to="/" replace />
  return children
}
