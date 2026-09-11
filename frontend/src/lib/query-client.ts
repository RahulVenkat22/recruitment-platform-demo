import { QueryClient, type DefaultOptions } from '@tanstack/react-query'

type QueryDefaults = NonNullable<DefaultOptions['queries']>

export function createQueryClient(overrides: Partial<QueryDefaults> = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
        ...overrides,
      },
    },
  })
}

export const queryClient = createQueryClient()
