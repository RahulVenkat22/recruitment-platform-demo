import {
  ArrowRightIcon,
  CheckCheckIcon,
  FileTextIcon,
  FingerprintIcon,
  SparklesIcon,
  UsersIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { TalentOSLoader } from '@/components/shared/TalentOSLoader'
import { TalentOSLogo } from '@/components/shared/TalentOSLogo'
import { TalentOrbit } from '@/components/shared/TalentOrbit'
import { LoginForm } from '@/features/auth/LoginForm'
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
    <main className="grid min-h-dvh bg-surface lg:grid-cols-[1.08fr_1fr]">
      <section
        data-surface="dark"
        aria-label="About TalentOS"
        className="login-showcase relative isolate flex flex-col overflow-hidden px-8 py-8 text-white max-lg:hidden xl:px-14"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-25 [background-image:radial-gradient(#b7c8d2_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,transparent,black)]"
        />
        <motion.div {...enter(0)} className="flex items-center gap-5">
          <BrandLogo on="dark" className="h-11" />
          <span className="h-8 w-px bg-white/20" />
          <TalentOSLogo size="sm" />
        </motion.div>
        <motion.div {...enter(0.12)} className="mt-14 xl:mt-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-medium tracking-[0.14em] text-[#dceba0] uppercase">
            <SparklesIcon aria-hidden="true" className="size-3" /> AI-powered recruitment
            intelligence
          </span>
          <h2 className="mt-6 max-w-lg text-[46px]/[1.12] font-semibold tracking-[-0.045em] xl:text-[56px]">
            People make
            <br />
            the difference.
            <br />
            <span className="text-[#dceba0]">Find yours.</span>
          </h2>
          <p className="mt-5 max-w-[360px] text-[15px]/[26px] text-[#b9cdd4]">
            A more thoughtful way to find talent. Connect skills, potential and possibility in one
            intelligent workspace.
          </p>
        </motion.div>
        <motion.div
          {...enter(0.3)}
          className="relative flex min-h-[320px] flex-1 items-center justify-center py-7"
        >
          <TalentOrbit />
          <div
            aria-hidden="true"
            className="absolute top-12 left-0 rounded-2xl border border-white/15 bg-[#1d424b]/90 px-4 py-3 shadow-xl animate-bh-float"
          >
            <span className="flex items-center gap-2 text-[12px] text-white">
              <FileTextIcon className="size-4 text-[#dceba0]" /> Every resume, understood
            </span>
            <span className="mt-1 block text-[10px] text-[#b9cdd4]">
              Skills. Experience. Potential.
            </span>
          </div>
          <div
            aria-hidden="true"
            className="absolute right-0 bottom-12 rounded-2xl border border-white/15 bg-[#1d424b]/90 px-4 py-3 shadow-xl animate-bh-float [animation-delay:-3s]"
          >
            <span className="flex items-center gap-2 text-[12px] text-white">
              <CheckCheckIcon className="size-4 text-[#dceba0]" /> The right people. The right role.
            </span>
            <span className="mt-1 block text-[10px] text-[#b9cdd4]">
              Matching with a reason behind it.
            </span>
          </div>
        </motion.div>
        <motion.div
          {...enter(0.4)}
          className="flex flex-wrap items-center gap-3 border-t border-white/15 pt-5 text-[11px] text-[#b9cdd4]"
        >
          <span className="flex items-center gap-2">
            <UsersIcon className="size-3.5 text-[#dceba0]" /> Discover
          </span>
          <ArrowRightIcon className="size-3" />
          <span>Connect</span>
          <ArrowRightIcon className="size-3" />
          <span>Hire</span>
          <span className="ml-auto text-[#8ca8b4]">Built around people.</span>
        </motion.div>
      </section>
      <section
        className="login-form-panel flex min-h-dvh flex-col px-6 py-7 sm:px-12"
        aria-labelledby="login-heading"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="lg:hidden">
            <BrandLogo className="h-10" />
          </div>
          <span className="ml-auto flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-[10px] text-ink-subtle">
            <FingerprintIcon aria-hidden="true" className="size-3.5 text-primary" /> Your secure
            workspace
          </span>
        </div>
        <motion.div
          {...enter(0.15)}
          className="mx-auto flex w-full max-w-[390px] flex-1 flex-col justify-center py-12"
        >
          <TalentOSLogo on="light" size="lg" />
          <p className="mt-9 text-[10px] font-semibold tracking-[0.16em] text-primary uppercase">
            Good to have you here
          </p>
          <h1
            id="login-heading"
            className="mt-3 font-heading text-[36px]/[1.2] font-bold tracking-[-0.04em] text-ink"
          >
            Welcome back
          </h1>
          <p className="mt-3 text-[14px] text-ink-muted">Sign in to continue</p>
          <LoginForm className="mt-8" />
          <div className="mt-8 flex items-start gap-2.5 rounded-xl bg-primary-soft/60 p-3.5">
            <SparklesIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-[11px]/[18px] text-ink-muted">
              From the first hello to the first day.
              <br />
              <span className="font-medium text-primary">
                Your entire hiring journey, beautifully connected.
              </span>
            </p>
          </div>
        </motion.div>
        <footer className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-ink-subtle">
          <span>© {new Date().getFullYear()} Buro Happold</span>
          <span>For authorised staff only</span>
        </footer>
      </section>
      {signingIn && !reduced && (
        <TalentOSLoader
          durationMs={SIGN_IN_HOLD_MS}
          name={user?.first_name || user?.full_name || undefined}
        />
      )}
    </main>
  )
}
