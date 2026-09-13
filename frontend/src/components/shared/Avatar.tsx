import { useState } from 'react'
import {
  AVATAR_SIZES,
  avatarHue,
  type AvatarHue,
  type AvatarSize,
} from '@/components/shared/avatar-utils'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

const FONT_SIZES: Record<AvatarSize, string> = {
  xs: 'text-[8px]',
  sm: 'text-[9px]',
  md: 'text-[12px]',
  lg: 'text-[14px]',
  xl: 'text-[22px]',
  '2xl': 'text-[32px]',
}

// Full class names so Tailwind can see them at build time.
const HUE_CLASSES: Record<AvatarHue, string> = {
  slate: 'bg-avatar-slate',
  indigo: 'bg-avatar-indigo',
  violet: 'bg-avatar-violet',
  sky: 'bg-avatar-sky',
  teal: 'bg-avatar-teal',
  emerald: 'bg-avatar-emerald',
  amber: 'bg-avatar-amber',
  rose: 'bg-avatar-rose',
}

export type { AvatarSize } from '@/components/shared/avatar-utils'

export interface AvatarProps {
  name: string
  src?: string | null
  size?: AvatarSize
  /** 2px ring in the surface colour, for overlapping groups and dark backgrounds. */
  ring?: boolean
  className?: string
}

/**
 * Circular avatar. Shows the photo when there is one and it loads; otherwise two
 * initials on a hue hashed from the name. A broken URL falls back on `onError`.
 */
export function Avatar({ name, src, size = 'md', ring = false, className }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const px = AVATAR_SIZES[size]
  const showImage = Boolean(src) && failedSrc !== src
  const dimensions = { width: px, height: px }
  const shared = cn(
    'inline-flex shrink-0 select-none rounded-full',
    ring && 'ring-2 ring-surface',
    className,
  )

  if (showImage) {
    return (
      <img
        src={src ?? undefined}
        alt={name}
        width={px}
        height={px}
        loading="lazy"
        onError={() => setFailedSrc(src ?? null)}
        data-slot="avatar"
        data-size={size}
        style={dimensions}
        className={cn(shared, 'object-cover')}
      />
    )
  }

  const hue = avatarHue(name)
  return (
    <span
      role="img"
      aria-label={name}
      data-slot="avatar"
      data-size={size}
      data-hue={hue}
      style={dimensions}
      className={cn(
        shared,
        'items-center justify-center font-medium tracking-[0.02em] text-white',
        HUE_CLASSES[hue],
        FONT_SIZES[size],
      )}
    >
      {initials(name)}
    </span>
  )
}
