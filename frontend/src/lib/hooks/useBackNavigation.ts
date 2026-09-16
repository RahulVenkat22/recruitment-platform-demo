import { useCallback, useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router'
import { backLabelFor } from '@/app/layout/breadcrumbs'
import { stepsToPreviousPage, useHistoryStore } from '@/lib/history-store'

/** Mount once inside the AppShell: records every in-app location change. */
export function useTrackHistory(): void {
  const location = useLocation()
  const kind = useNavigationType()
  const record = useHistoryStore((state) => state.record)

  useEffect(() => {
    record({ key: location.key, pathname: location.pathname, search: location.search }, kind)
    // Only a new location key means a navigation happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])
}

export interface BackNavigation {
  /** Where a plain link would go: the real previous page when known, else the fallback. */
  href: string
  /** Human label of that destination ("Interviews", "Homepage", "Job description"). */
  label: string
  /** Steps back through the browser history when possible, otherwise navigates to the fallback. */
  goBack: () => void
  /** True when the destination came from the history rather than the fallback. */
  fromHistory: boolean
}

/**
 * The Back control of a page (Enhancement.md 4): returns to the page the user
 * came from, keeping browser history and the app's Back button in step. A page
 * opened directly (fresh tab, refresh) has no earlier entry and uses the
 * breadcrumb parent given as `fallback`.
 */
export function useBackNavigation(fallback: string, fallbackLabel: string): BackNavigation {
  const navigate = useNavigate()
  const entries = useHistoryStore((state) => state.entries)
  const steps = stepsToPreviousPage(entries)
  const previous = steps === null ? null : entries[entries.length - 1 + steps]

  const goBack = useCallback(() => {
    if (steps === null) navigate(fallback)
    else navigate(steps)
  }, [navigate, steps, fallback])

  if (!previous) return { href: fallback, label: fallbackLabel, goBack, fromHistory: false }
  return {
    href: `${previous.pathname}${previous.search}`,
    label: backLabelFor(previous.pathname),
    goBack,
    fromHistory: true,
  }
}
