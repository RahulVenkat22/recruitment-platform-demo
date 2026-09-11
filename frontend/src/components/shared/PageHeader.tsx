import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useUiStore, type Crumb } from '@/lib/ui-store'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: string
  subtitle?: string
  /** Published to the TopBar breadcrumb slot for as long as this header is mounted. */
  breadcrumbs?: Crumb[]
  /** Right-hand slot for primary and secondary actions. */
  actions?: ReactNode
  /** Optional tab strip rendered under the title row. */
  tabs?: ReactNode
  className?: string
}

/**
 * Page title block. Sticks below the top bar inside the scrolling content area and
 * gains a hairline once the page has scrolled under it.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  actions,
  tabs,
  className,
}: PageHeaderProps) {
  const setBreadcrumbs = useUiStore((state) => state.setBreadcrumbs)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    setBreadcrumbs(breadcrumbs ?? [{ label: title }])
    return () => setBreadcrumbs([])
    // A new array literal per render would re-run this effect on every render; key on content instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBreadcrumbs, title, JSON.stringify(breadcrumbs)])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting))
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      <header
        data-stuck={stuck || undefined}
        className={cn(
          'sticky top-0 z-10 -mx-6 bg-bg/95 px-6 pt-5 pb-4 backdrop-blur-sm max-md:-mx-4 max-md:px-4',
          'border-b border-transparent transition-colors duration-150 ease-brand',
          stuck && 'border-line',
          className,
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-h1 text-ink">{title}</h1>
            {subtitle && <p className="mt-1 text-ink-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
        {tabs && <div className="mt-4">{tabs}</div>}
      </header>
    </>
  )
}
