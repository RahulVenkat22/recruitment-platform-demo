import { BriefcaseIcon, DatabaseIcon, FileTextIcon, MailIcon, type LucideIcon } from 'lucide-react'
import type { ComponentProps, CSSProperties } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEnumsStore, enumMeta } from '@/lib/enums'
import { cn } from '@/lib/utils'

/** lucide dropped brand marks, so the LinkedIn glyph is drawn here. */
function LinkedInGlyph(props: ComponentProps<'svg'>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M4.98 3.5A2.5 2.5 0 1 1 5 8.5a2.5 2.5 0 0 1-.02-5ZM3 9.5h4v11H3v-11Zm6.5 0h3.8v1.6h.05c.55-1 1.85-2 3.8-2 4.05 0 4.85 2.65 4.85 6.1v6.3h-4v-5.6c0-1.35-.05-3.05-1.9-3.05-1.9 0-2.2 1.45-2.2 2.95v5.7h-4v-11Z" />
    </svg>
  )
}

type SourceIcon = LucideIcon | typeof LinkedInGlyph

const ICONS: Record<string, SourceIcon> = {
  internal: DatabaseIcon,
  referral: MailIcon,
  naukri: BriefcaseIcon,
  linkedin: LinkedInGlyph,
  resume: FileTextIcon,
}

export interface SourceBadgeProps {
  /** One source key, or several to render as a stack ("Internal + LinkedIn"). */
  source: string | readonly string[]
  iconOnly?: boolean
  size?: 'sm' | 'md'
  className?: string
}

/** "Internal Database" -> "Internal" for the compact stack; single badges keep the full label. */
function shortLabel(label: string): string {
  return label.split(' ')[0] ?? label
}

/**
 * Pill for a candidate source with its icon (database, mail, briefcase, LinkedIn)
 * and the colour pair from `GET /meta/enums/`. Several sources collapse into one
 * neutral pill listing each icon and short name.
 */
export function SourceBadge({
  source,
  iconOnly = false,
  size = 'sm',
  className,
}: SourceBadgeProps) {
  // Subscribe so the badge re-renders when the enum catalogue lands.
  useEnumsStore((state) => state.catalogue)
  const keys = (typeof source === 'string' ? [source] : [...source]).filter(Boolean)
  if (keys.length === 0) return null

  const metas = keys.map((key) => ({ key, meta: enumMeta('source', key), Icon: ICONS[key] }))
  const sizing = size === 'sm' ? 'h-5 text-caption' : 'h-6 text-[13px] font-[450]'
  const iconSize = size === 'sm' ? 'size-3' : 'size-3.5'

  if (metas.length === 1) {
    const { key, meta, Icon } = metas[0]
    const style = { '--badge-bg': meta.bg, '--badge-fg': meta.fg } as CSSProperties
    const pill = (
      <span
        data-testid="source-badge"
        data-slot="source-badge"
        data-source={key}
        data-icon-only={iconOnly || undefined}
        aria-label={iconOnly ? meta.label : undefined}
        title={iconOnly ? undefined : meta.label}
        style={style}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-pill bg-(--badge-bg) text-(--badge-fg) whitespace-nowrap',
          sizing,
          iconOnly ? (size === 'sm' ? 'w-5 justify-center' : 'w-6 justify-center') : 'px-2',
          className,
        )}
      >
        {Icon && <Icon aria-hidden="true" className={cn('shrink-0', iconSize)} />}
        {!iconOnly && <span>{meta.label}</span>}
      </span>
    )
    if (!iconOnly) return pill
    return (
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent side="top">{meta.label}</TooltipContent>
      </Tooltip>
    )
  }

  const names = metas.map(({ meta }) => shortLabel(meta.label)).join(' + ')
  return (
    <span
      data-testid="source-badge"
      data-slot="source-badge"
      data-source={keys.join('+')}
      data-icon-only={iconOnly || undefined}
      aria-label={iconOnly ? names : undefined}
      title={names}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-pill bg-surface-2 text-ink-muted whitespace-nowrap',
        sizing,
        'px-2',
        className,
      )}
    >
      <span className="inline-flex shrink-0 items-center gap-1">
        {metas.map(({ key, meta, Icon }) =>
          Icon ? (
            <Icon
              key={key}
              aria-hidden="true"
              style={{ color: meta.fg }}
              className={cn('shrink-0', iconSize)}
            />
          ) : null,
        )}
      </span>
      {!iconOnly && <span className="truncate">{names}</span>}
    </span>
  )
}
