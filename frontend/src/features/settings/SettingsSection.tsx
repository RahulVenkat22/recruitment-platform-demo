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
      className={cn('max-w-[720px] rounded-card bg-surface p-5 shadow-card', className)}
    >
      <h2 id={headingId} className="text-h2 text-ink">
        {title}
      </h2>
      {description && <p className="mt-1 text-ink-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}
