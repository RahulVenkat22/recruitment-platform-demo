import { useCallback, useSyncExternalStore } from 'react'

/** plan.md 8.3: page padding and layout switch below 768px. */
export const MOBILE_QUERY = '(max-width: 767px)'
export const TABLET_QUERY = '(max-width: 1023px)'
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function getMediaQueryList(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query)
}

/** True while the CSS media `query` matches; re-renders when it flips. Always false on the server. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = getMediaQueryList(query)
      if (!list) return () => {}
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => getMediaQueryList(query)?.matches ?? false, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}

export function useIsTablet(): boolean {
  return useMediaQuery(TABLET_QUERY)
}

/** Mirrors the global CSS rule in index.css so JS-driven motion can opt out too. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery(REDUCED_MOTION_QUERY)
}
