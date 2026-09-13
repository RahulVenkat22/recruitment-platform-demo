import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { EASE_BRAND, staggerDelay } from '@/lib/motion'

export interface StaggerItemProps {
  /** Position in the list; drives the delay (plan.md 8.3: 30ms apart, capped at ten). */
  index: number
  children: ReactNode
  className?: string
}

/**
 * Wraps one list item so it fades in and rises 6px with a per-index delay.
 * Under `prefers-reduced-motion` it renders a plain block, so the list still
 * lays out identically (pass grid or flex sizing through `className`).
 */
export function StaggerItem({ index, children, className }: StaggerItemProps) {
  const reducedMotion = useReducedMotion()
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
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: EASE_BRAND, delay: staggerDelay(index) }}
    >
      {children}
    </motion.div>
  )
}
