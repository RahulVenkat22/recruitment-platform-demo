import type { QueryClient } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient as defaultQueryClient } from '@/lib/query-client'

interface CoreProvidersProps {
  children: ReactNode
  client?: QueryClient
}

/** Everything except the router, so tests can wrap a MemoryRouter around it. */
export function CoreProviders({ children, client = defaultQueryClient }: CoreProvidersProps) {
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <CoreProviders>{children}</CoreProviders>
    </BrowserRouter>
  )
}
