import { useEffect, useMemo, useRef, useState } from 'react'

/** Search inputs wait this long after the last keystroke before hitting the API. */
export const DEFAULT_DEBOUNCE_MS = 250

/**
 * Returns `value` once it has stayed unchanged for `delayMs`. The first render
 * returns the initial value immediately so a page never starts empty.
 */
export function useDebounce<T>(value: T, delayMs: number = DEFAULT_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(handle)
  }, [value, delayMs])

  return debounced
}

/**
 * A stable function that runs the latest `callback` once `delayMs` has passed
 * since the last call. Pending calls are dropped on unmount.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number = DEFAULT_DEBOUNCE_MS,
): (...args: Args) => void {
  const latest = useRef(callback)
  const handle = useRef<number | null>(null)

  useEffect(() => {
    latest.current = callback
  }, [callback])

  useEffect(
    () => () => {
      if (handle.current !== null) window.clearTimeout(handle.current)
    },
    [],
  )

  return useMemo(
    () =>
      (...args: Args) => {
        if (handle.current !== null) window.clearTimeout(handle.current)
        handle.current = window.setTimeout(() => {
          handle.current = null
          latest.current(...args)
        }, delayMs)
      },
    [delayMs],
  )
}
