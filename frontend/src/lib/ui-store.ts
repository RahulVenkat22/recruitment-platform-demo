import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Crumb {
  label: string
  to?: string
}

export interface UiState {
  /** Persisted to localStorage so the layout survives reloads. */
  sidebarCollapsed: boolean
  /** Published by the current page's PageHeader and rendered in the TopBar. */
  breadcrumbs: Crumb[]
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setBreadcrumbs: (crumbs: Crumb[]) => void
}

export const UI_STORAGE_KEY = 'aimious.ui'

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      breadcrumbs: [],
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setBreadcrumbs: (breadcrumbs) => set({ breadcrumbs }),
    }),
    {
      name: UI_STORAGE_KEY,
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
)
