import { motion, useReducedMotion } from 'motion/react'
import { Avatar } from '@/components/shared/Avatar'
import { AvatarGroup } from '@/components/shared/AvatarGroup'
import { MatchRing } from '@/components/shared/MatchRing'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DEMO_ACCOUNTS } from '@/features/auth/demo-accounts'
import type { Person } from '@/types/domain'

/** Seven of the seeded people, so the group shows four faces and "+3" (plan.md 9.1). */
const SHOWCASE_PEOPLE: Person[] = DEMO_ACCOUNTS.slice(0, 7).map((account) => ({
  id: account.email,
  name: account.name,
  designation: account.designation,
  avatar_url: null,
}))

const DRIFT = { duration: 6, repeat: Infinity, ease: 'easeInOut' } as const

/**
 * The dark graphite panel: brand mark, headline, and two preview cards built from
 * the real product components so the showcase is the product, not an illustration.
 * Below `lg` it collapses to a header band with the tagline.
 */
export function LoginShowcase() {
  const reducedMotion = useReducedMotion()

  return (
    <section
      aria-label="About Aimious"
      className="graphite-dots relative overflow-hidden text-surface-2 lg:min-h-dvh"
    >
      <div className="relative flex h-full flex-col justify-between px-6 py-6 lg:px-14 lg:py-12">
        <div className="flex items-center gap-3">
          <img
            src="/brand/aimious-mark-for-dark-bg.svg"
            alt=""
            width={36}
            height={36}
            className="size-9"
          />
          <span className="text-[17px] font-medium tracking-[-0.01em] text-white">Aimious</span>
        </div>

        <div className="mt-8 max-w-[34rem] lg:mt-0">
          <h2 className="text-display text-white lg:text-[36px]/[42px]">
            AI-powered recruitment intelligence
          </h2>
          <p className="mt-3 max-w-[30rem] text-[15px]/[24px] text-line-strong lg:mt-4">
            Rank candidates, run interviews, and track every step from first contact to onboarding.
          </p>

          {/* Decorative previews: kept out of the tab order and the accessibility tree. */}
          <div inert aria-hidden="true" className="relative mt-12 hidden h-[236px] lg:block">
            <motion.div
              animate={reducedMotion ? undefined : { y: [0, -10, 0], x: [0, 4, 0] }}
              transition={DRIFT}
              className="absolute top-0 left-0 w-[376px] -rotate-[1.5deg] rounded-card bg-surface p-4 text-ink shadow-popover"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-small font-medium text-ink">
                    Senior Python Developer
                  </p>
                  <p className="mt-0.5 text-caption text-ink-subtle">Engineering, Chennai</p>
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
              animate={reducedMotion ? undefined : { y: [0, 9, 0], x: [0, -5, 0] }}
              transition={{ ...DRIFT, delay: 0.8 }}
              className="absolute top-[124px] left-16 flex w-[320px] items-center gap-3 rotate-[1deg] rounded-card bg-surface p-4 text-ink shadow-popover"
            >
              <Avatar name="John Doe" size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-ink">John Doe</p>
                <p className="truncate text-caption text-ink-subtle">Python, Django, AWS, 6 yrs</p>
              </div>
              <MatchRing value={95} size="md" />
            </motion.div>
          </div>
        </div>

        <p className="mt-8 hidden text-caption text-line-strong/60 lg:block">© 2026 Aimious</p>
      </div>
    </section>
  )
}
