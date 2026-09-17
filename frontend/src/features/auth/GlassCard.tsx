import { useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GlassCardProps {
  children: ReactNode
  className?: string
}

/**
 * Dark frosted panel for the sign-in form: blurred backdrop, hairline border,
 * a lime highlight along the top edge and a soft sheen that follows the cursor.
 */
export function GlassCard({ children, className }: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const element = ref.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    element.style.setProperty('--mx', `${event.clientX - rect.left}px`)
    element.style.setProperty('--my', `${event.clientY - rect.top}px`)
  }

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      className={cn(
        'group/glass relative isolate overflow-hidden rounded-[18px] border border-white/[0.12] bg-[rgb(14_14_14/0.66)] shadow-[0_40px_120px_-40px_rgb(0_0_0/0.95),inset_0_1px_0_rgb(255_255_255/0.08)] backdrop-blur-2xl backdrop-saturate-150',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-accent/80 to-transparent"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 ease-brand group-hover/glass:opacity-100"
        style={{
          background:
            'radial-gradient(520px circle at var(--mx, 50%) var(--my, 0%), rgb(196 214 0 / 0.09), transparent 45%)',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
