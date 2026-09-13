import type { QueryClient } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, type InitialEntry } from 'react-router'
import { CoreProviders } from '@/app/providers'
import { AppRoutes } from '@/app/router'
import { createQueryClient } from '@/lib/query-client'

interface ProviderRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Path string or a location object (e.g. with `state`). */
  route?: InitialEntry
  client?: QueryClient
}

/** Renders `ui` inside the app providers with a MemoryRouter positioned at `route`. */
export function renderWithProviders(ui: ReactElement, options: ProviderRenderOptions = {}) {
  const { route = '/', client, ...renderOptions } = options
  const queryClient = client ?? createQueryClient({ retry: false, staleTime: 0 })

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <CoreProviders client={queryClient}>{children}</CoreProviders>
      </MemoryRouter>
    )
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...renderOptions }) }
}

/** Renders the whole route tree at `route`. */
export function renderApp(route: string, options: Omit<ProviderRenderOptions, 'route'> = {}) {
  return renderWithProviders(<AppRoutes />, { route, ...options })
}
