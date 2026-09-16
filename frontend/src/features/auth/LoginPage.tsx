import { motion, useReducedMotion } from 'motion/react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { LoginForm } from '@/features/auth/LoginForm'
import { LoginShowcase } from '@/features/auth/LoginShowcase'
import { useAuthStore } from '@/lib/auth-store'
import { EASE_BRAND } from '@/lib/motion'

interface FromState {
  from?: { pathname?: string; search?: string }
}

/** Where to go after signing in: the page RequireAuth bounced from, or the homepage (Enhancement.md 2). */
function redirectTarget(state: unknown): string {
  const from = (state as FromState | null)?.from
  return from?.pathname ? `${from.pathname}${from.search ?? ''}` : '/'
}

/**
 * Public route (Enhancement.md 1): the Buro Happold showcase panel beside a
 * calm sign-in column. Two panels on desktop; a dark header band above the form
 * on phones. The column and its fields ease in on load; reduced motion renders
 * everything in place.
 */
export default function LoginPage() {
  const status = useAuthStore((state) => state.status)
  const location = useLocation()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const target = redirectTarget(location.state)

  if (status === 'authed') return <Navigate to={target} replace />

  return (
    <main className="min-h-dvh bg-bg lg:grid lg:grid-cols-[58fr_42fr]">
      <LoginShowcase />
      <motion.section
        aria-labelledby="login-heading"
        initial={reducedMotion ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: EASE_BRAND, delay: 0.15 }}
        className="relative flex items-center justify-center px-6 py-10 sm:px-10 lg:px-12 lg:py-16"
      >
        <div className="w-full max-w-[400px]">
          <p className="text-caption font-medium tracking-[0.14em] text-accent-ink uppercase">
            Recruitment platform
          </p>
          <h1 id="login-heading" className="mt-2 text-display text-ink">
            Welcome back
          </h1>
          <p className="mt-1.5 text-ink-muted">Sign in to continue</p>
          <LoginForm className="mt-8" onSuccess={() => navigate(target, { replace: true })} />
          <p className="mt-10 text-caption text-ink-subtle">
            © 2026 Buro Happold · For authorised staff only.
          </p>
        </div>
      </motion.section>
    </main>
  )
}
