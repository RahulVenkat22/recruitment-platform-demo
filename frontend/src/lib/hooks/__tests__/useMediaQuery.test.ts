import { act, renderHook } from '@testing-library/react'
import { useIsMobile, useMediaQuery, usePrefersReducedMotion } from '@/lib/hooks/useMediaQuery'

type Listener = (event: MediaQueryListEvent) => void

function installMatchMedia(initial: Record<string, boolean>) {
  const listeners = new Map<string, Set<Listener>>()
  const state = { ...initial }
  window.matchMedia = vi.fn((query: string) => {
    const list = {
      get matches() {
        return state[query] ?? false
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => {
        if (!listeners.has(query)) listeners.set(query, new Set())
        listeners.get(query)!.add(listener)
      },
      removeEventListener: (_type: string, listener: Listener) => {
        listeners.get(query)?.delete(listener)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }
    return list as unknown as MediaQueryList
  })
  return {
    set(query: string, matches: boolean) {
      state[query] = matches
      listeners
        .get(query)
        ?.forEach((listener) => listener({ matches, media: query } as MediaQueryListEvent))
    },
    listenerCount: (query: string) => listeners.get(query)?.size ?? 0,
  }
}

describe('useMediaQuery', () => {
  const original = window.matchMedia
  afterEach(() => {
    window.matchMedia = original
  })

  it('reads the current match and follows changes', () => {
    const media = installMatchMedia({ '(max-width: 767px)': false })
    const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))
    expect(result.current).toBe(false)

    act(() => {
      media.set('(max-width: 767px)', true)
    })
    expect(result.current).toBe(true)
  })

  it('unsubscribes on unmount', () => {
    const media = installMatchMedia({ '(min-width: 1024px)': true })
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 1024px)'))
    expect(media.listenerCount('(min-width: 1024px)')).toBe(1)
    unmount()
    expect(media.listenerCount('(min-width: 1024px)')).toBe(0)
  })

  it('exposes the plan.md breakpoints and the reduced-motion preference', () => {
    installMatchMedia({
      '(max-width: 767px)': true,
      '(prefers-reduced-motion: reduce)': true,
    })
    expect(renderHook(() => useIsMobile()).result.current).toBe(true)
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(true)
  })
})
