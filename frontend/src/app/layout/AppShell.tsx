import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
import { motion } from 'motion/react'
import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router'
import { RouteErrorBoundary } from '@/app/RouteErrorBoundary'
import { Sidebar } from '@/app/layout/Sidebar'
import { TopBar } from '@/app/layout/TopBar'
import { Skeleton } from '@/components/ui/skeleton'
import { useLoadEnums } from '@/lib/enums'
import { useTrackHistory } from '@/lib/hooks/useBackNavigation'

/** One short entrance per route; tab and filter updates keep their mounted page. */
function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const reducedMotion = useMotionPreference()

  return (
    <motion.div
      key={pathname}
      initial={reducedMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.45, ease: [0.22, 1, 0.36, 1] }}
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
  // The enum catalogue (labels, badge colours) loads once per authenticated session.
  useLoadEnums()
  // Every in-app navigation is recorded so page Back controls return to the real previous page.
  useTrackHistory()
  const { pathname } = useLocation()
  const mainRef = useRef<HTMLElement>(null)
  const previousPath = useRef(pathname)
  useEffect(() => {
    if (previousPath.current !== pathname) {
      mainRef.current?.scrollTo?.({ top: 0, behavior: 'instant' })
      mainRef.current?.focus({ preventScroll: true })
      previousPath.current = pathname
    }
  }, [pathname])

  return (
    <div className="relative flex h-dvh overflow-hidden bg-bg text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-small focus:font-medium focus:text-ink focus:shadow-popover focus:outline-2 focus:outline-offset-2 focus:outline-primary"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* The content area is its own scroll container so the sidebar and top bar stay put. */}
        <main
          ref={mainRef}
          id="main"
          tabIndex={-1}
          className="app-canvas min-h-0 flex-1 overflow-x-hidden overflow-y-auto outline-none"
        >
          <PageTransition>
            <div className="mx-auto w-full max-w-[1440px] px-6 pb-12 max-md:px-4">
              {/* Keyed on the path so a page that crashed does not poison the next one. */}
              <RouteErrorBoundary key={pathname}>
                <Suspense fallback={<PageFallback />}>
                  <Outlet />
                </Suspense>
              </RouteErrorBoundary>
            </div>
          </PageTransition>
        </main>
      </div>
    </div>
  )
}
