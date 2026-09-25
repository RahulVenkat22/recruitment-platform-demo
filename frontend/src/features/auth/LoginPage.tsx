import { LockKeyholeIcon, ShieldCheckIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState, type CSSProperties } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { TalentOSLoader } from '@/components/shared/TalentOSLoader'
import { TalentOSLogo } from '@/components/shared/TalentOSLogo'
import { CAROUSEL_ITEMS } from '@/features/auth/carousel-items'
import { LoginForm } from '@/features/auth/LoginForm'
import { LoginShowcase } from '@/features/auth/LoginShowcase'
import { useAuthStore } from '@/lib/auth-store'
import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { EASE_BRAND } from '@/lib/motion'

interface FromState {
  from?: { pathname?: string; search?: string }
}
const SIGN_IN_HOLD_MS = 900

function redirectTarget(state: unknown): string {
  const from = (state as FromState | null)?.from
  return from?.pathname ? `${from.pathname}${from.search ?? ''}` : '/'
}

export default function LoginPage() {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  const navigate = useNavigate()
  const reduced = useMotionPreference()
  const [stageIndex, setStageIndex] = useState(0)
  const stage = CAROUSEL_ITEMS[stageIndex]
  const { theme } = stage
  const target = redirectTarget(location.state)
  const [arrivedSignedIn] = useState(status === 'authed')
  const signingIn = status === 'authed' && !arrivedSignedIn

  useEffect(() => {
    document.title = 'Welcome back · TalentOS'
  }, [])
  useEffect(() => {
    if (!signingIn) return
    void import('@/features/home/HomePage')
    const timer = window.setTimeout(
      () => navigate(target, { replace: true }),
      reduced ? 0 : SIGN_IN_HOLD_MS,
    )
    return () => window.clearTimeout(timer)
  }, [signingIn, navigate, target, reduced])

  if (status === 'authed' && arrivedSignedIn) return <Navigate to={target} replace />

  const enter = (delay: number) => ({
    initial: reduced ? (false as const) : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.65, ease: EASE_BRAND, delay: reduced ? 0 : delay },
  })

  return (
    <main
      className="talent-login"
      data-reduced-motion={reduced}
      data-carousel-theme={stage.id}
      style={
        {
          '--login-bg': theme.background,
          '--login-glow': theme.glow,
          '--login-accent': theme.accent,
          '--login-muted': theme.muted,
          '--login-ink': theme.ink,
          '--login-button': theme.button,
          '--login-button-hover': theme.buttonHover,
          '--login-card': theme.card,
          '--login-border': theme.border,
        } as CSSProperties
      }
    >
      <a className="talent-login__skip" href="#login-heading">
        Skip to sign in
      </a>
      <header className="talent-login__header">
        <TalentOSLogo size="md" />
        <div className="talent-login__brand-partner">
          <span>BUILT FOR</span>
          <BrandLogo on="dark" className="h-9" />
        </div>
      </header>
      <div className="talent-login__layout">
        <LoginShowcase paused={signingIn} onStageChange={setStageIndex} />
        <section className="talent-login__form-panel" aria-labelledby="login-heading">
          <motion.div {...enter(0.15)} className="talent-login__content">
            <div className="talent-login__card-top">
              <span className="talent-login__secure">
                <LockKeyholeIcon aria-hidden="true" /> Secure workspace
              </span>
            </div>
            <p className="talent-login__eyebrow">{stage.formEyebrow}</p>
            <h1 id="login-heading" tabIndex={-1}>
              Welcome back
            </h1>
            <p className="talent-login__description">Sign in to continue</p>
            <LoginForm className="talent-login__form" />
            <div className="talent-login__card-note">
              <ShieldCheckIcon aria-hidden="true" />
              <span>{stage.formNote}</span>
            </div>
          </motion.div>
          <p className="talent-login__access-note">For authorised staff only</p>
        </section>
      </div>
      <footer className="talent-login__footer">
        <span>© {new Date().getFullYear()} Buro Happold</span>
        <span>Built around people. Powered by possibility.</span>
        <span className="talent-login__footer-status">
          <i /> TalentOS workspace
        </span>
      </footer>
      {signingIn && !reduced && (
        <TalentOSLoader
          durationMs={SIGN_IN_HOLD_MS}
          name={user?.first_name || user?.full_name || undefined}
        />
      )}
    </main>
  )
}
