import { cn } from '@/lib/utils'

export interface BrandLogoProps {
  /** `wordmark` is the BURO HAPPOLD logotype between its lime bars; `mark` the lime "B" tile. */
  variant?: 'wordmark' | 'mark'
  /** Which background the logo sits on; the wordmark's letters are black on light, white on dark. */
  on?: 'light' | 'dark'
  className?: string
}

const WORDMARK = {
  light: '/brand/burohappold-logo.png',
  dark: '/brand/burohappold-logo-for-dark-bg.png',
}

/**
 * The Buro Happold logo, from the supplied artwork (logo1 = wordmark, logo2 = "B"
 * tile). The wordmark is 3:1 with the letters between two lime bars, so give it
 * at least 48px of height for the name to stay readable.
 */
export function BrandLogo({ variant = 'wordmark', on = 'light', className }: BrandLogoProps) {
  if (variant === 'mark') {
    return (
      <img
        src="/brand/burohappold-b-mark.png"
        alt="Buro Happold"
        width={320}
        height={320}
        className={cn('size-7 shrink-0', className)}
      />
    )
  }
  return (
    <img
      src={WORDMARK[on]}
      alt="Buro Happold"
      width={1086}
      height={362}
      className={cn('h-12 w-auto', className)}
    />
  )
}
