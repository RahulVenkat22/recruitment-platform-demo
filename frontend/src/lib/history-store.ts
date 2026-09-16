import { create } from 'zustand'

/**
 * The in-app navigation history, recorded by `useTrackHistory` in the AppShell
 * (Enhancement.md 4, issue 1). A page's Back control asks `stepsToPreviousPage`
 * how far back the page the user actually came from sits, so Interview →
 * Candidate → Back lands on Interviews, while a direct link or a refresh (no
 * earlier entry) falls back to the breadcrumb parent.
 */
export interface HistoryEntry {
  /** `location.key` from React Router; stable across back / forward. */
  key: string
  pathname: string
  search: string
}

export type NavigationKind = 'PUSH' | 'POP' | 'REPLACE'

interface HistoryState {
  entries: HistoryEntry[]
  record: (entry: HistoryEntry, kind: NavigationKind) => void
  reset: () => void
}

export function applyNavigation(
  entries: HistoryEntry[],
  entry: HistoryEntry,
  kind: NavigationKind,
): HistoryEntry[] {
  const last = entries[entries.length - 1]
  // StrictMode runs effects twice and a re-render can repeat the same location.
  if (last && last.key === entry.key) return entries
  if (kind === 'PUSH') return [...entries, entry]
  if (kind === 'REPLACE') return [...entries.slice(0, -1), entry]
  // POP: the browser went back (a known key: drop everything after it) or
  // forward / landed somewhere new (append).
  const index = entries.findIndex((known) => known.key === entry.key)
  return index >= 0 ? entries.slice(0, index + 1) : [...entries, entry]
}

/**
 * Negative number of steps (for `navigate(steps)`) to the most recent entry on a
 * different pathname, or `null` when the app has no such entry. Same-path entries
 * (tab or filter changes on the current page) are skipped, so Back never loops.
 */
export function stepsToPreviousPage(entries: HistoryEntry[]): number | null {
  const current = entries[entries.length - 1]
  if (!current) return null
  for (let index = entries.length - 2; index >= 0; index -= 1) {
    if (entries[index].pathname !== current.pathname) return index - (entries.length - 1)
  }
  return null
}

export const useHistoryStore = create<HistoryState>()((set) => ({
  entries: [],
  record: (entry, kind) =>
    set((state) => ({ entries: applyNavigation(state.entries, entry, kind) })),
  reset: () => set({ entries: [] }),
}))
