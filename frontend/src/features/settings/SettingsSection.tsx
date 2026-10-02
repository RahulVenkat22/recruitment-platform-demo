import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SettingsSectionProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

/** One white card per settings tab: title, one-line description, then the form. */
export function SettingsSection({ title, description, children, className }: SettingsSectionProps) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'section-reveal max-w-[880px] rounded-card border border-line bg-surface p-6 shadow-card sm:p-8',
        className,
      )}
    >
      <h2 id={headingId} className="text-h2 text-ink">
        {title}
      </h2>
      {description && <p className="mt-1 text-ink-muted">{description}</p>}
      <div className="mt-6 border-t border-line pt-6">{children}</div>
    </section>
  )
}
