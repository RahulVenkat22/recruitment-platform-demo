import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { EASE_BRAND } from '@/lib/motion'
import { cn } from '@/lib/utils'

const LIME = '#c4d600'
const TILE = '#0c0c0c'

/** The centre figure's shoulders: a semicircle on two short legs, traced left to right. */
const ARCH = 'M 80.75 163 V 155.5 A 47.25 47.25 0 0 1 175.25 155.5 V 163'

/** When each part starts, in seconds after mount: the node tree first, then the people, then the name. */
const AT = {
  tile: 0.1,
  node: 0.3,
  stem: 0.45,
  branches: 0.75,
  leaves: 1.0,
  arch: 0.5,
  shoulders: 0.7,
  heads: 1.05,
  wordmark: 1.3,
  copy: 1.7,
}

/** Shown one at a time, evenly across the hold; the last one stays. */
const STEPS = [
  'Preparing your workspace',
  'Loading roles and candidates',
  'Syncing your hiring timeline',
  'Ready',
]

const LETTERS = ['T', 'a', 'l', 'e', 'n', 't', 'O', 'S']

/**
 * The TalentOS mark (docs/brand/talentos-logo-source.png) redrawn as SVG so it
 * can build itself: the lime node tree grows first, the three figures' shoulders
 * are traced in, then the heads pop. Geometry is measured from the 256px PNG.
 */
function TalentOSMarkDrawing({ reduced, className }: { reduced: boolean; className?: string }) {
  const draw = (at: number, duration: number) => ({
    initial: reduced ? false : { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: {
      pathLength: { delay: at, duration, ease: EASE_BRAND },
      opacity: { delay: at, duration: 0.1 },
    },
  })
  const pop = (at: number, r: number) => ({
    initial: reduced ? false : { r: 0 },
    animate: { r },
    transition: { delay: at, type: 'spring' as const, stiffness: 420, damping: 20 },
  })

  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" className={cn('block', className)}>
      <motion.rect
        x={1.5}
        y={1.5}
        width={253}
        height={253}
        rx={52}
        fill={TILE}
        stroke="rgb(196 214 0 / 0.3)"
        strokeWidth={3}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: AT.tile, duration: 0.5 }}
      />

      {/* The two lime figures' shoulders; the tile-coloured stroke under the centre arch keeps the gap between them. */}
      <motion.path
        d="M 32.6 159.6 A 38 38 0 0 1 107.4 159.6"
        fill="none"
        stroke={LIME}
        strokeWidth={14}
        {...draw(AT.shoulders, 0.5)}
      />
      <motion.path
        d="M 148.6 159.6 A 38 38 0 0 1 223.4 159.6"
        fill="none"
        stroke={LIME}
        strokeWidth={14}
        {...draw(AT.shoulders, 0.5)}
      />
      <path d={ARCH} fill="none" stroke={TILE} strokeWidth={35} />
      <motion.path d={ARCH} fill="none" stroke="#fff" strokeWidth={16.5} {...draw(AT.arch, 0.6)} />

      {/* The node tree under the centre figure. */}
      <motion.path
        d="M 128 144 V 173"
        fill="none"
        stroke={LIME}
        strokeWidth={7}
        strokeLinecap="round"
        {...draw(AT.stem, 0.3)}
      />
      <motion.path
        d="M 128 173 L 93 196"
        fill="none"
        stroke={LIME}
        strokeWidth={7}
        strokeLinecap="round"
        {...draw(AT.branches, 0.3)}
      />
      <motion.path
        d="M 128 173 L 163 196"
        fill="none"
        stroke={LIME}
        strokeWidth={7}
        strokeLinecap="round"
        {...draw(AT.branches, 0.3)}
      />
      <motion.circle cx={128} cy={144} fill={LIME} {...pop(AT.node, 11)} />
      <motion.circle cx={93} cy={196} fill={LIME} {...pop(AT.leaves, 11.5)} />
      <motion.circle cx={163} cy={196} fill={LIME} {...pop(AT.leaves + 0.08, 11.5)} />

      {/* Heads: the centre one white, the two beside it lime. */}
      <motion.circle cx={128} cy={70.5} fill="#fff" {...pop(AT.heads, 25)} />
      <motion.circle cx={70} cy={84} fill={LIME} {...pop(AT.heads + 0.12, 18)} />
      <motion.circle cx={186} cy={84} fill={LIME} {...pop(AT.heads + 0.12, 18)} />
    </svg>
  )
}

export interface TalentOSLoaderProps {
  /** How long the loader stays up; the progress bar fills over it and the status lines pace themselves to it. */
  durationMs: number
  /** Who is signing in, for the greeting; without it the line is just "Welcome back". */
  name?: string
  /** Accessible name of the status region. */
  label?: string
  className?: string
}

/**
 * Full-screen branded hold after sign-in: the TalentOS mark draws itself over
 * the graphite grid with a breathing lime glow and rippling rings, the name
 * rises in letter by letter with the "OS" lit in lime, then a greeting, a
 * progress bar timed to `durationMs` and a status line that steps through
 * what is being prepared. Under reduced motion everything renders in place
 * and only the bar and the status text still move.
 */
export function TalentOSLoader({
  durationMs,
  name,
  label = 'Signing you in',
  className,
}: TalentOSLoaderProps) {
  const reduced = Boolean(useReducedMotion())
  const [step, setStep] = useState(0)

  useEffect(() => {
    const handle = window.setInterval(
      () => setStep((value) => Math.min(value + 1, STEPS.length - 1)),
      durationMs / STEPS.length,
    )
    return () => window.clearInterval(handle)
  }, [durationMs])

  const rise = (at: number) => ({
    initial: reduced ? false : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: at, duration: 0.55, ease: EASE_BRAND },
  })

  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-slot="talentos-loader"
      data-surface="dark"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.45, ease: EASE_BRAND }}
      className={cn(
        'graphite-dots fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden text-ink',
        className,
      )}
    >
      {/* Vignette, and the lime scan line that marks "working" across the app. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(10_10_10/0.8)_100%)]"
      />
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 overflow-hidden bg-white/5">
        <div className="h-full w-1/3 bg-accent animate-bh-scan" />
      </div>

      <div className="relative flex flex-col items-center px-6">
        <div className="relative">
          <motion.div
            aria-hidden="true"
            className="absolute -inset-20 rounded-full bg-[radial-gradient(closest-side,rgb(196_214_0/0.32),transparent_72%)] blur-2xl"
            initial={reduced ? false : { opacity: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, scale: [1, 1.12, 1] }}
            transition={{
              opacity: { delay: 0.3, duration: 1 },
              scale: { duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 1.4 },
            }}
          />
          {!reduced &&
            [0, 1].map((ring) => (
              <motion.span
                key={ring}
                aria-hidden="true"
                className="absolute inset-0 rounded-[21%] border border-accent/50"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ scale: [0.9, 1.7], opacity: [0, 0.5, 0] }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: 'easeOut',
                  delay: 1.6 + ring * 1.5,
                }}
              />
            ))}
          <motion.div
            initial={reduced ? false : { opacity: 0, scale: 0.88, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_BRAND, delay: AT.tile }}
          >
            <motion.div
              animate={reduced ? undefined : { scale: [1, 1.025, 1] }}
              transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut', delay: 1.6 }}
            >
              <TalentOSMarkDrawing
                reduced={reduced}
                className="size-32 [filter:drop-shadow(0_0_24px_rgb(196_214_0/0.35))] sm:size-[148px]"
              />
            </motion.div>
          </motion.div>
        </div>

        <p
          aria-hidden="true"
          className="mt-8 flex font-heading text-[40px]/[40px] font-bold tracking-[-0.03em] sm:text-[46px]/[46px]"
        >
          {LETTERS.map((letter, index) => (
            <motion.span
              key={index}
              className={cn(
                'inline-block',
                index < 6 ? 'text-white' : 'text-accent [text-shadow:0_0_28px_rgb(196_214_0/0.55)]',
              )}
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: AT.wordmark + index * 0.045, duration: 0.5, ease: EASE_BRAND }}
            >
              {letter}
            </motion.span>
          ))}
        </p>

        <motion.p {...rise(AT.copy)} className="mt-4 text-[15px]/[22px] text-ink-muted">
          Welcome back{name ? `, ${name}` : ''}
        </motion.p>

        <motion.div
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mt-8 h-0.5 w-64 max-w-full overflow-hidden rounded-pill bg-white/10"
        >
          <motion.div
            className="h-full origin-left bg-accent shadow-[0_0_14px_#c4d600]"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: durationMs / 1000, ease: 'linear' }}
          />
        </motion.div>

        <motion.div
          {...rise(AT.copy + 0.1)}
          aria-hidden="true"
          className="relative mt-4 h-4 w-64 max-w-full text-caption tracking-[0.12em] text-ink-subtle uppercase"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={step}
              className="absolute inset-x-0 flex items-center justify-center gap-2"
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: EASE_BRAND }}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full bg-accent',
                  step < STEPS.length - 1 && 'animate-pulse',
                )}
              />
              {STEPS[step]}
            </motion.p>
          </AnimatePresence>
        </motion.div>
      </div>

      <motion.div {...rise(AT.copy + 0.2)} className="absolute bottom-8">
        <BrandLogo variant="wordmark" on="dark" className="h-9 opacity-70" />
      </motion.div>
      <span className="sr-only">{label}</span>
    </motion.div>
  )
}
