import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { EASE_BRAND, staggerDelay } from '@/lib/motion'

export interface StaggerItemProps {
  /** Position in the list; drives the capped entrance delay. */
  index: number
  children: ReactNode
  className?: string
}

/**
 * Wraps one list item so it fades in and rises 14px with a per-index delay.
 * Under `prefers-reduced-motion` it renders a plain block, so the list still
 * lays out identically (pass grid or flex sizing through `className`).
 */
export function StaggerItem({ index, children, className }: StaggerItemProps) {
  const reducedMotion = useMotionPreference()
  if (reducedMotion) {
    return (
      <div data-slot="stagger-item" className={className}>
        {children}
      </div>
    )
  }
  return (
    <motion.div
      data-slot="stagger-item"
      className={className}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_BRAND, delay: staggerDelay(index) }}
    >
      {children}
    </motion.div>
  )
}
