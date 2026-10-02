import { animate, useInView } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { EASE_BRAND } from '@/lib/motion'

const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })

/** Animate only the visual number; assistive technology gets the final value immediately. */
export function AnimatedNumber({
  value,
  suffix = '',
  decimals = 0,
}: {
  value: number
  suffix?: string
  decimals?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(0)
  const reduced = useMotionPreference()
  const visible = useInView(ref, { once: true })
  const safeValue = Number.isFinite(value) ? value : 0
  const formatted = `${numberFormat.format(safeValue)}${suffix}`

  useEffect(() => {
    const node = ref.current
    if (!node || reduced || !visible) return
    const controls = animate(previous.current, safeValue, {
      duration: 0.85,
      ease: EASE_BRAND,
      onUpdate: (current) => {
        previous.current = current
        node.textContent = `${numberFormat.format(Number(current.toFixed(decimals)))}${suffix}`
      },
    })
    return () => controls.stop()
  }, [safeValue, suffix, decimals, reduced, visible])

  return (
    <>
      <span className="sr-only">{formatted}</span>
      <span key={reduced ? 'static' : 'animated'} ref={ref} aria-hidden="true">
        {formatted}
      </span>
    </>
  )
}
