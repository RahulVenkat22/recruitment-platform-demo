import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: ReactNode
  /** A primary or secondary button; the caller decides the verb ("Create job description"). */
  action?: ReactNode
  /** `md` (default) for page bodies and tabs, `sm` for cards and popovers. */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Centred empty state: a 64px soft circle around the icon, an H3 title, muted
 * description and an optional action (plan.md 8.4). Written as an invitation to
 * act, not an apology.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
  className,
}: EmptyStateProps) {
  const compact = size === 'sm'

  return (
    <div
      role="status"
      data-slot="empty-state"
      data-size={size}
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {Icon && (
        <span
          data-testid="empty-state-icon"
          aria-hidden="true"
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-surface-2 text-ink-subtle',
            compact ? 'size-10 [&_svg]:size-5' : 'size-16 [&_svg]:size-7',
          )}
        >
          <Icon strokeWidth={1.75} />
        </span>
      )}
      <h3 className={cn('text-ink', compact ? 'text-[15px] font-medium' : 'text-h3')}>{title}</h3>
      {description && (
        <p className={cn('max-w-md text-ink-muted', compact ? 'text-small' : 'text-body')}>
          {description}
        </p>
      )}
      {action && (
        <div className={cn('flex items-center gap-2', compact ? 'mt-1' : 'mt-2')}>{action}</div>
      )}
    </div>
  )
}
