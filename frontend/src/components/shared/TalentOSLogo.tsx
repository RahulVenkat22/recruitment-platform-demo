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

/** A folded T ribbon: a single connection, with a shaded fold for depth. */
export function TalentOSMark({
  size = 32,
  on = 'dark',
  className,
}: {
  size?: number
  on?: 'light' | 'dark'
  className?: string
}) {
  return (
    <img
      src={on === 'dark' ? '/brand/talentos-mark.svg' : '/brand/talentos-mark-light.svg'}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={cn('shrink-0 object-contain', className)}
    />
  )
}

/** Shared lockup with surface-aware artwork and a quieter sage OS accent. */
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
      className={cn('inline-flex items-center gap-2', className)}
    >
      <TalentOSMark size={px} on={on} />
      {wordmark && (
        <span
          aria-hidden="true"
          className="font-heading leading-none font-semibold tracking-[-0.045em]"
          style={{ fontSize: Math.round(px * 0.7) }}
        >
          <span className={on === 'dark' ? 'text-[#f2f5ec]' : 'text-[#20382c]'}>Talent</span>
          <span className={cn('font-normal', on === 'dark' ? 'text-[#d6eb8b]' : 'text-[#526c36]')}>
            OS
          </span>
        </span>
      )}
    </span>
  )
}
