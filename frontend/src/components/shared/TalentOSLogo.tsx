import { cn } from '@/lib/utils'

export interface TalentOSLogoProps {
  /** Which background the logo sits on; the wordmark swaps its letter colour. */
  on?: 'light' | 'dark'
  /** Mark height: 24, 32 or 40px. */
  size?: 'sm' | 'md' | 'lg'
  /** Hide the wordmark for tight spots. */
  wordmark?: boolean
  className?: string
}

const SIZES = { sm: 24, md: 32, lg: 40 } as const

/**
 * The TalentOS mark from the supplied artwork (docs/brand/talentos-logo-source.png):
 * three people over a lime node network on a graphite tile, the counterpart to the
 * lime Buro Happold "B" tile.
 */
export function TalentOSMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <img
      src="/brand/talentos-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
    />
  )
}

/** Mark plus the "TalentOS" wordmark, the "OS" in brand lime. */
export function TalentOSLogo({
  on = 'dark',
  size = 'md',
  wordmark = true,
  className,
}: TalentOSLogoProps) {
  const px = SIZES[size]
  return (
    <span
      role="img"
      aria-label="TalentOS"
      className={cn('inline-flex items-center gap-2.5', className)}
    >
      <TalentOSMark size={px} />
      {wordmark && (
        <span
          aria-hidden="true"
          className="font-heading leading-none font-bold tracking-[-0.03em]"
          style={{ fontSize: Math.round(px * 0.66) }}
        >
          <span className={on === 'dark' ? 'text-white' : 'text-ink'}>Talent</span>
          <span className={on === 'dark' ? 'text-accent' : 'text-accent-ink'}>OS</span>
        </span>
      )}
    </span>
  )
}
