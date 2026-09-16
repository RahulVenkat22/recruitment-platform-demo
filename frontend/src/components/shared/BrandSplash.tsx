import { motion, useReducedMotion } from 'motion/react'

/** Full-page hold while the session is being restored; the Buro Happold mark breathes gently. */
export function BrandSplash({ label = 'Restoring your session' }: { label?: string }) {
  const reducedMotion = useReducedMotion()

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-slot="brand-splash"
      className="grid min-h-dvh place-items-center bg-bg"
    >
      <motion.img
        src="/brand/burohappold-mark.svg"
        alt=""
        width={48}
        height={48}
        className="size-12 rounded-[10px]"
        animate={reducedMotion ? undefined : { opacity: [0.55, 1, 0.55], scale: [1, 1.05, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}
