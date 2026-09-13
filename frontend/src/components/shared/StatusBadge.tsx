import type { CSSProperties } from 'react'
import { useEnumMeta, type EnumMetaKind } from '@/lib/enums'
import { cn } from '@/lib/utils'

export interface StatusBadgeProps {
  /** Enum key, e.g. `ai_shortlisted` or, with `kind="jd_status"`, `open`. */
  status: string
  kind?: EnumMetaKind
  size?: 'sm' | 'md'
  /** Leading 6px dot in the text colour. */
  dot?: boolean
  className?: string
}

/**
 * Pill with the soft background and text colour served by `GET /meta/enums/`
 * (fallback table in lib/enums.ts). Colours arrive as hex from the API, so they
 * go through CSS variables rather than Tailwind classes.
 */
export function StatusBadge({
  status,
  kind = 'status',
  size = 'sm',
  dot = false,
  className,
}: StatusBadgeProps) {
  const meta = useEnumMeta(kind, status)
  const style = { '--badge-bg': meta.bg, '--badge-fg': meta.fg } as CSSProperties

  return (
    <span
      data-slot="status-badge"
      data-status={status}
      data-size={size}
      title={meta.label}
      style={style}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-pill bg-(--badge-bg) text-(--badge-fg) whitespace-nowrap',
        size === 'sm' ? 'h-5 px-2 text-caption' : 'h-6 px-2.5 text-[13px] font-[450]',
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          data-slot="status-dot"
          className="size-1.5 shrink-0 rounded-full bg-current"
        />
      )}
      <span className="truncate">{meta.label}</span>
    </span>
  )
}
