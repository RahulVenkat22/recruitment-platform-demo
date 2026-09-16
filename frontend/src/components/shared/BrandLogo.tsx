import { cn } from '@/lib/utils'

export interface BrandLogoProps {
  /** `wordmark` is the full Buro Happold logotype; `mark` the square monogram for tight spots. */
  variant?: 'wordmark' | 'mark'
  /** Which background the logo sits on; the wordmark swaps its letter colour. */
  on?: 'light' | 'dark'
  className?: string
}

const WORDMARK = {
  light: '/brand/burohappold-wordmark-for-light-bg.svg',
  dark: '/brand/burohappold-wordmark-for-dark-bg.svg',
}

/** The Buro Happold logo (Enhancement.md 1): one component so every page uses the same assets. */
export function BrandLogo({ variant = 'wordmark', on = 'light', className }: BrandLogoProps) {
  if (variant === 'mark') {
    return (
      <img
        src="/brand/burohappold-mark.svg"
        alt="Buro Happold"
        width={28}
        height={28}
        className={cn('size-7 rounded-[6px]', className)}
      />
    )
  }
  return (
    <img
      src={WORDMARK[on]}
      alt="Buro Happold"
      width={230}
      height={51}
      className={cn('h-6 w-auto', className)}
    />
  )
}
