import { Navigate, useLocation, useNavigate } from 'react-router'
import { LoginForm } from '@/features/auth/LoginForm'
import { LoginShowcase } from '@/features/auth/LoginShowcase'
import { useAuthStore } from '@/lib/auth-store'

interface FromState {
  from?: { pathname?: string; search?: string }
}

/** Where to go after signing in: the page RequireAuth bounced from, or the dashboard. */
function redirectTarget(state: unknown): string {
  const from = (state as FromState | null)?.from
  return from?.pathname ? `${from.pathname}${from.search ?? ''}` : '/dashboard'
}

/** Public route. Two panels on desktop (plan.md 9.1); a dark header band above the form on mobile. */
export default function LoginPage() {
  const status = useAuthStore((state) => state.status)
  const location = useLocation()
  const navigate = useNavigate()
  const target = redirectTarget(location.state)

  if (status === 'authed') return <Navigate to={target} replace />

  return (
    <main className="min-h-dvh bg-bg lg:grid lg:grid-cols-[58fr_42fr]">
      <LoginShowcase />
      <section
        aria-labelledby="login-heading"
        className="flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12 lg:py-16"
      >
        <div className="w-full max-w-[380px]">
          <h1 id="login-heading" className="text-display text-ink">
            Welcome back
          </h1>
          <p className="mt-1.5 text-ink-muted">Sign in to continue</p>
          <LoginForm className="mt-8" onSuccess={() => navigate(target, { replace: true })} />
        </div>
      </section>
    </main>
  )
}
