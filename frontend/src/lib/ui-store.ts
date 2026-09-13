import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Crumb {
  label: string
  to?: string
}

export const PAGE_SIZES = [20, 50, 100] as const
export type PageSize = (typeof PAGE_SIZES)[number]

export interface UiState {
  /** Persisted to localStorage so the layout survives reloads. */
  sidebarCollapsed: boolean
  /** Default rows per page for every list; persisted (plan.md 9.13 Preferences). */
  pageSize: PageSize
  /** Published by the current page's PageHeader and rendered in the TopBar. */
  breadcrumbs: Crumb[]
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setPageSize: (pageSize: PageSize) => void
  setBreadcrumbs: (crumbs: Crumb[]) => void
}

export const UI_STORAGE_KEY = 'aimious.ui'

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      pageSize: 20,
      breadcrumbs: [],
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setPageSize: (pageSize) => set({ pageSize }),
      setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
    }),
    {
      name: UI_STORAGE_KEY,
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        pageSize: state.pageSize,
      }),
    },
  ),
)
