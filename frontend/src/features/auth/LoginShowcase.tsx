import { motion, useReducedMotion } from 'motion/react'
import { Avatar } from '@/components/shared/Avatar'
import { AvatarGroup } from '@/components/shared/AvatarGroup'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { MatchRing } from '@/components/shared/MatchRing'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DEMO_ACCOUNTS } from '@/features/auth/demo-accounts'
import { EASE_BRAND } from '@/lib/motion'
import type { Person } from '@/types/domain'

/** Seven of the seeded people, so the group shows four faces and "+3" (plan.md 9.1). */
const SHOWCASE_PEOPLE: Person[] = DEMO_ACCOUNTS.slice(0, 7).map((account) => ({
  id: account.email,
  name: account.name,
  designation: account.designation,
  avatar_url: null,
}))

const DRIFT = { duration: 6, repeat: Infinity, ease: 'easeInOut' } as const

/** Structural line-art: two arches and their hangers, drawn in as the page loads. */
const STRUCTURE: { d: string; delay: number; width: number }[] = [
  { d: 'M-20 300 Q 400 20 820 300', delay: 0.2, width: 1.2 },
  { d: 'M-20 300 Q 400 120 820 300', delay: 0.6, width: 0.8 },
  { d: 'M120 300 L120 214', delay: 1.1, width: 0.8 },
  { d: 'M260 300 L260 156', delay: 1.2, width: 0.8 },
  { d: 'M400 300 L400 138', delay: 1.3, width: 0.8 },
  { d: 'M540 300 L540 156', delay: 1.4, width: 0.8 },
  { d: 'M680 300 L680 214', delay: 1.5, width: 0.8 },
  { d: 'M-20 300 L820 300', delay: 0.1, width: 1.4 },
]

function fade(delay: number, reduced: boolean | null) {
  return {
    initial: reduced ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: EASE_BRAND, delay },
  }
}

/**
 * The graphite panel (Enhancement.md 1): the Buro Happold wordmark, the headline,
 * a slowly drifting lime glow over an engineering grid, structural line-art that
 * draws itself in, and two preview cards built from the real product components.
 * Below `lg` it collapses to a header band. Every animation stops under
 * prefers-reduced-motion.
 */
export function LoginShowcase() {
  const reducedMotion = useReducedMotion()

  return (
    <section
      aria-label="About Buro Happold recruitment"
      data-surface="dark"
      className="graphite-dots relative overflow-hidden text-ink lg:min-h-dvh"
    >
      {/* Backdrop: two lime glows drift in opposite directions behind the grid. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-[30%] -left-[20%] size-[70vmax] rounded-full bg-[radial-gradient(closest-side,rgb(196_214_0/0.22),transparent_72%)] animate-bh-drift" />
        <div className="absolute -right-[25%] -bottom-[35%] size-[60vmax] rounded-full bg-[radial-gradient(closest-side,rgb(196_214_0/0.12),transparent_72%)] animate-bh-drift [animation-delay:-9s] [animation-direction:alternate-reverse]" />
        <svg
          className="absolute inset-x-0 bottom-0 hidden h-[44%] w-full lg:block"
          viewBox="0 0 800 300"
          preserveAspectRatio="none"
        >
          {STRUCTURE.map((line) => (
            <motion.path
              key={line.d}
              d={line.d}
              fill="none"
              stroke="#C4D600"
              strokeWidth={line.width}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              initial={reducedMotion ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.55 }}
              transition={{ duration: 2.2, ease: 'easeInOut', delay: line.delay }}
            />
          ))}
        </svg>
      </div>

      <div className="relative flex h-full flex-col justify-between px-6 py-6 lg:px-14 lg:py-12">
        <motion.div {...fade(0, reducedMotion)} className="flex items-center gap-3">
          <BrandLogo variant="wordmark" on="dark" className="h-7" />
          <span aria-hidden="true" className="hidden h-5 w-px bg-line-strong sm:block" />
          <span className="hidden text-caption font-medium tracking-[0.14em] text-ink-muted uppercase sm:block">
            Recruitment
          </span>
        </motion.div>

        <div className="mt-8 max-w-[34rem] lg:mt-0">
          <motion.p
            {...fade(0.15, reducedMotion)}
            className="mb-3 hidden text-caption font-medium tracking-[0.14em] text-accent uppercase lg:block"
          >
            Talent for the built environment
          </motion.p>
          <motion.h2
            {...fade(0.25, reducedMotion)}
            className="text-display text-white lg:text-[40px]/[46px]"
          >
            AI-powered recruitment intelligence
          </motion.h2>
          <motion.p
            {...fade(0.35, reducedMotion)}
            className="mt-3 max-w-[30rem] text-[15px]/[24px] text-ink-muted lg:mt-4"
          >
            Find, assess and onboard the engineers who shape tomorrow's cities. Every search ranked
            by fit, every step from first contact to day one on a single timeline.
          </motion.p>

          {/* Decorative previews: kept out of the tab order and the accessibility tree. */}
          <div inert aria-hidden="true" className="relative mt-12 hidden h-[236px] lg:block">
            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 24, rotate: -1.5 }}
              animate={
                reducedMotion
                  ? { opacity: 1 }
                  : { opacity: 1, y: [0, -10, 0], x: [0, 4, 0], rotate: -1.5 }
              }
              // The fade-in runs once; only the drift repeats.
              transition={
                reducedMotion
                  ? undefined
                  : {
                      opacity: { duration: 0.7, ease: EASE_BRAND, delay: 0.6 },
                      rotate: { duration: 0.7, ease: EASE_BRAND, delay: 0.6 },
                      y: { ...DRIFT, delay: 0.6 },
                      x: { ...DRIFT, delay: 0.6 },
                    }
              }
              data-surface="light"
              className="absolute top-0 left-0 w-[376px] rounded-card border-t-2 border-accent bg-surface p-4 text-ink shadow-popover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-small font-medium text-ink">
                    Senior Structural Engineer
                  </p>
                  <p className="mt-0.5 text-caption text-ink-subtle">Structures, London</p>
                </div>
                <StatusBadge status="open" kind="jd_status" dot />
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <AvatarGroup people={SHOWCASE_PEOPLE} size="sm" />
                <p className="text-caption text-ink-muted tabular-nums">
                  127 candidates • 12 shortlisted
                </p>
              </div>
            </motion.div>

            <motion.div
              initial={reducedMotion ? false : { opacity: 0, y: 24, rotate: 1 }}
              animate={
                reducedMotion
                  ? { opacity: 1 }
                  : { opacity: 1, y: [0, 9, 0], x: [0, -5, 0], rotate: 1 }
              }
              transition={
                reducedMotion
                  ? undefined
                  : {
                      opacity: { duration: 0.7, ease: EASE_BRAND, delay: 0.85 },
                      rotate: { duration: 0.7, ease: EASE_BRAND, delay: 0.85 },
                      y: { ...DRIFT, delay: 1.2 },
                      x: { ...DRIFT, delay: 1.2 },
                    }
              }
              data-surface="light"
              className="absolute top-[124px] left-16 flex w-[320px] items-center gap-3 rounded-card bg-surface p-4 text-ink shadow-popover"
            >
              <Avatar name="John Doe" size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-ink">John Doe</p>
                <p className="truncate text-caption text-ink-subtle">Python, Django, AWS • 6 yrs</p>
              </div>
              <MatchRing value={95} size="md" />
            </motion.div>
          </div>
        </div>

        <motion.div
          {...fade(0.5, reducedMotion)}
          className="mt-8 hidden items-center gap-4 text-caption text-ink-subtle lg:flex"
        >
          <span>© 2026 Buro Happold</span>
          <span aria-hidden="true" className="size-1 rounded-full bg-line-strong" />
          <span>Internal recruitment platform</span>
        </motion.div>
      </div>
    </section>
  )
}
