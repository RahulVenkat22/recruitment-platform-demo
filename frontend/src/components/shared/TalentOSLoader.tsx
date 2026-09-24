import { motion } from 'motion/react'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { TalentOSLogo } from '@/components/shared/TalentOSLogo'
import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { EASE_BRAND } from '@/lib/motion'
import { cn } from '@/lib/utils'

export interface TalentOSLoaderProps {
  durationMs: number
  name?: string
  label?: string
  className?: string
}

/** A short welcome transition; timings fit within the actual hold instead of implying extra work. */
export function TalentOSLoader({
  durationMs,
  name,
  label = 'Signing you in',
  className,
}: TalentOSLoaderProps) {
  const reduced = useMotionPreference()
  return (
    <motion.div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-slot="talentos-loader"
      data-surface="dark"
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduced ? 0 : 0.18 }}
      className={cn(
        'login-showcase fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 text-ink',
        className,
      )}
    >
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduced ? 0 : 0.4, ease: EASE_BRAND }}
        className="relative flex flex-col items-center"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-24 rounded-full bg-[radial-gradient(closest-side,rgb(196_214_0/0.12),transparent)]"
        />
        <TalentOSLogo on="dark" size="lg" />
        <p className="mt-6 text-[16px] font-medium text-white">
          Welcome back{name ? `, ${name}` : ''}
        </p>
        <p className="mt-2 text-small text-ink-muted">Opening your workspace</p>
        <div aria-hidden="true" className="mt-6 h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full origin-left rounded-full bg-accent"
            initial={reduced ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: reduced ? 0 : durationMs / 1000, ease: EASE_BRAND }}
          />
        </div>
      </motion.div>
      <BrandLogo on="dark" className="absolute bottom-10 h-9 opacity-70" />
    </motion.div>
  )
}
