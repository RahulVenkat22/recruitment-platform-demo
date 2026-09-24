import {
  FileTextIcon,
  GaugeIcon,
  ListChecksIcon,
  ScanSearchIcon,
  SparklesIcon,
  WaypointsIcon,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Fragment, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { TalentOSLoader } from '@/components/shared/TalentOSLoader'
import { TalentOSLogo, TalentOSMark } from '@/components/shared/TalentOSLogo'
import { GlassCard } from '@/features/auth/GlassCard'
import { LoginBackdrop } from '@/features/auth/LoginBackdrop'
import { LoginForm } from '@/features/auth/LoginForm'
import { useAuthStore } from '@/lib/auth-store'
import { EASE_BRAND } from '@/lib/motion'

interface FromState {
  from?: { pathname?: string; search?: string }
}

/** How long the welcome loader stays up after a successful sign-in before the app opens. */
const SIGN_IN_HOLD_MS = 5000

/** Where to go after signing in: the page RequireAuth bounced from, or the homepage (Enhancement.md 2). */
function redirectTarget(state: unknown): string {
  const from = (state as FromState | null)?.from
  return from?.pathname ? `${from.pathname}${from.search ?? ''}` : '/'
}

function fade(delay: number, reduced: boolean | null) {
  return {
    initial: reduced ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE_BRAND, delay },
  }
}

const FLOW = [
  { icon: FileTextIcon, label: 'Résumés' },
  { icon: SparklesIcon, label: 'AI matching' },
  { icon: WaypointsIcon, label: 'Roles & skills' },
]

const CAPABILITIES = [
  { icon: ScanSearchIcon, label: 'Semantic résumé search' },
  { icon: GaugeIcon, label: 'Explainable match scores' },
  { icon: ListChecksIcon, label: 'One timeline per hire' },
]

/** Reads the scene for people who skip it: résumés, through the matcher, out to roles. */
function FlowLegend({ reduced }: { reduced: boolean | null }) {
  return (
    <div className="flex items-center gap-3">
      {FLOW.map((step, index) => (
        <Fragment key={step.label}>
          <span className="inline-flex items-center gap-2 rounded-pill border border-white/10 bg-white/[0.04] px-3 py-1.5 text-small text-ink-muted backdrop-blur-sm">
            <step.icon aria-hidden="true" className="size-4 text-accent" />
            {step.label}
          </span>
          {index < FLOW.length - 1 && (
            <span aria-hidden="true" className="relative h-px w-12 bg-white/15">
              <motion.span
                className="absolute -top-[2.5px] size-1.5 rounded-full bg-accent shadow-[0_0_10px_#C4D600]"
                animate={reduced ? undefined : { x: [0, 42], opacity: [0, 1, 1, 0] }}
                transition={{
                  duration: 1.8,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: index * 0.9,
                }}
              />
            </span>
          )}
        </Fragment>
      ))}
    </div>
  )
}

/**
 * Public route: a full-bleed WebGL scene of résumés flowing through the
 * TalentOS matching engine, with the Buro Happold and TalentOS logos up top,
 * the pitch on the left and a frosted sign-in card on the right. Phones stack
 * the same pieces. Motion eases in on load and stops under reduced motion.
 * A successful sign-in holds on the TalentOS loader for five seconds before
 * the app opens; visitors who arrive already signed in are sent straight on.
 */
export default function LoginPage() {
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)
  const location = useLocation()
  const navigate = useNavigate()
  const reducedMotion = useReducedMotion()
  const target = redirectTarget(location.state)
  // Captured on mount: `authed` now but not then means the form on this page signed the visitor in.
  const [arrivedSignedIn] = useState(status === 'authed')
  const signingIn = status === 'authed' && !arrivedSignedIn

  useEffect(() => {
    if (!signingIn) return
    // Fetch the homepage chunk during the hold so the app opens the moment it ends.
    void import('@/features/home/HomePage')
    const timer = window.setTimeout(() => navigate(target, { replace: true }), SIGN_IN_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [signingIn, navigate, target])

  if (status === 'authed' && arrivedSignedIn) return <Navigate to={target} replace />

  return (
    <main
      data-surface="dark"
      className="relative min-h-dvh overflow-hidden bg-graphite text-ink selection:bg-accent selection:text-graphite"
    >
      <LoginBackdrop paused={signingIn} />

      <div className="relative z-10 flex min-h-dvh flex-col">
        <motion.header
          {...fade(0, reducedMotion)}
          className="flex items-center gap-4 px-6 pt-6 sm:gap-5 lg:px-12 lg:pt-8"
        >
          <BrandLogo variant="wordmark" on="dark" className="h-12 lg:h-14" />
          <span aria-hidden="true" className="h-8 w-px bg-white/15" />
          <TalentOSLogo on="dark" size="md" />
        </motion.header>

        <div className="flex flex-1 flex-col gap-8 px-6 pt-8 pb-8 lg:grid lg:grid-cols-[minmax(0,1fr)_440px] lg:grid-rows-[auto_minmax(12rem,1fr)_auto] lg:gap-x-16 lg:px-12 lg:pt-10 lg:pb-6 xl:grid-cols-[minmax(0,1fr)_460px]">
          <section
            aria-label="About TalentOS"
            className="max-w-[40rem] lg:col-start-1 lg:row-start-1 [text-shadow:0_2px_28px_rgb(0_0_0/0.75)]"
          >
            <motion.p
              {...fade(0.15, reducedMotion)}
              className="mb-3 text-caption font-medium tracking-[0.14em] text-accent uppercase"
            >
              Talent for the built environment
            </motion.p>
            <motion.h2
              {...fade(0.25, reducedMotion)}
              className="text-display text-white lg:text-[42px]/[48px] xl:text-[50px]/[56px]"
            >
              AI-powered recruitment intelligence
            </motion.h2>
            <motion.p
              {...fade(0.35, reducedMotion)}
              className="mt-4 hidden max-w-[30rem] text-[15px]/[24px] text-ink-muted sm:block lg:text-[16px]/[26px] lg:[@media(max-height:820px)]:hidden"
            >
              Every résumé becomes a living profile. TalentOS reads it, understands it and matches
              it to the roles that shape tomorrow's cities, then carries every hire from first
              contact to day one on a single timeline.
            </motion.p>
          </section>

          <div className="hidden lg:col-start-1 lg:row-start-3 lg:block">
            <motion.div {...fade(0.45, reducedMotion)}>
              <FlowLegend reduced={reducedMotion} />
            </motion.div>
            <motion.ul
              {...fade(0.55, reducedMotion)}
              className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-small text-ink-muted [text-shadow:0_1px_12px_rgb(0_0_0/0.8)] [@media(max-height:820px)]:hidden"
            >
              {CAPABILITIES.map((item) => (
                <li key={item.label} className="inline-flex items-center gap-2">
                  <item.icon aria-hidden="true" className="size-4 text-accent" />
                  {item.label}
                </li>
              ))}
            </motion.ul>
          </div>

          <motion.section
            aria-labelledby="login-heading"
            initial={reducedMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.7, ease: EASE_BRAND, delay: 0.2 }}
            className="w-full max-w-[460px] justify-self-end lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-center"
          >
            <GlassCard className="p-7 sm:p-9">
              <div className="flex items-center gap-2.5">
                <TalentOSMark size={26} />
                <span className="text-caption font-medium tracking-[0.14em] text-accent uppercase">
                  Recruitment platform
                </span>
              </div>
              <h1 id="login-heading" className="mt-5 text-display text-white">
                Welcome back
              </h1>
              <p className="mt-1.5 text-ink-muted">Sign in to continue</p>
              <LoginForm className="mt-8" />
              <p className="mt-8 text-caption text-ink-subtle">
                © 2026 Buro Happold · For authorised staff only.
              </p>
            </GlassCard>
          </motion.section>
        </div>

        <motion.footer
          {...fade(0.6, reducedMotion)}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 pb-6 text-caption text-ink-subtle lg:px-12 lg:pb-8"
        >
          <span>© 2026 Buro Happold</span>
          <span aria-hidden="true" className="size-1 rounded-full bg-line-strong" />
          <span>TalentOS · Internal recruitment platform</span>
          <span aria-hidden="true" className="hidden size-1 rounded-full bg-line-strong sm:block" />
          <span className="hidden sm:block">Move your cursor to explore the matching engine</span>
        </motion.footer>
      </div>

      {signingIn && (
        <TalentOSLoader
          durationMs={SIGN_IN_HOLD_MS}
          name={user?.first_name || user?.full_name || undefined}
        />
      )}
    </main>
  )
}
