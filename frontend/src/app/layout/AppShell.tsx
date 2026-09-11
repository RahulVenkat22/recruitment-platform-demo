import { motion, useReducedMotion } from 'motion/react'
import { Suspense, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Sidebar } from '@/app/layout/Sidebar'
import { TopBar } from '@/app/layout/TopBar'
import { Skeleton } from '@/components/ui/skeleton'

/** plan.md 8.3: page content fades in and rises 8px over 400ms; off under reduced motion. */
function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const reducedMotion = useReducedMotion()

  return (
    <motion.div
      key={pathname}
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function PageFallback() {
  return (
    <div aria-busy="true" aria-label="Loading page" className="space-y-4 pt-8">
      <Skeleton className="h-7 w-56 bg-surface-3" />
      <Skeleton className="h-4 w-80 bg-surface-3" />
    </div>
  )
}

export function AppShell() {
  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* The content area is its own scroll container so the sidebar and top bar stay put. */}
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          <PageTransition>
            <div className="mx-auto w-full max-w-[1440px] px-6 pb-12 max-md:px-4">
              <Suspense fallback={<PageFallback />}>
                <Outlet />
              </Suspense>
            </div>
          </PageTransition>
        </main>
      </div>
    </div>
  )
}
