import { ArrowLeftIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useUiStore, type Crumb } from '@/lib/ui-store'
import { cn } from '@/lib/utils'

export interface PageHeaderProps {
  title: ReactNode
  /** Something that sits beside the title: a status badge, a version pill. */
  titleAddon?: ReactNode
  subtitle?: ReactNode
  /** Third line for provenance ("Created by Rahul on 11 Sep 2026 • v3") and similar. */
  meta?: ReactNode
  /**
   * Published to the TopBar for as long as this header is mounted. The last crumb
   * with a `to` also renders as a back link above the title.
   */
  breadcrumbs?: Crumb[]
  /** Right-hand slot for primary and secondary actions. */
  actions?: ReactNode
  /** Optional tab strip rendered under the title row. */
  tabs?: ReactNode
  className?: string
}

function backCrumb(breadcrumbs: Crumb[] | undefined): Crumb | undefined {
  if (!breadcrumbs || breadcrumbs.length < 2) return undefined
  return [...breadcrumbs.slice(0, -1)].reverse().find((crumb) => crumb.to)
}

/**
 * Page title block. Sticks below the top bar inside the scrolling content area and
 * gains a hairline once the page has scrolled under it.
 */
export function PageHeader({
  title,
  titleAddon,
  subtitle,
  meta,
  breadcrumbs,
  actions,
  tabs,
  className,
}: PageHeaderProps) {
  const setBreadcrumbs = useUiStore((state) => state.setBreadcrumbs)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const titleText = typeof title === 'string' ? title : undefined
  const back = backCrumb(breadcrumbs)

  useEffect(() => {
    setBreadcrumbs(breadcrumbs ?? [{ label: titleText ?? '' }])
    return () => setBreadcrumbs([])
    // A new array literal per render would re-run this effect on every render; key on content instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setBreadcrumbs, titleText, JSON.stringify(breadcrumbs)])

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
        data-slot="page-header"
        data-stuck={stuck || undefined}
        className={cn(
          'sticky top-0 z-10 -mx-6 bg-bg/95 px-6 pt-5 pb-4 backdrop-blur-sm max-md:-mx-4 max-md:px-4',
          'border-b border-transparent transition-colors duration-150 ease-brand',
          stuck && 'border-line',
          className,
        )}
      >
        {back?.to && (
          <Link
            to={back.to}
            aria-label={`Back to ${back.label}`}
            className="mb-2 inline-flex items-center gap-1 rounded-control text-small text-ink-muted transition-colors duration-150 ease-brand hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-3.5" />
            <span>{back.label}</span>
          </Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="min-w-0 text-h1 text-ink">{title}</h1>
              {titleAddon && (
                <span className="inline-flex shrink-0 items-center">{titleAddon}</span>
              )}
            </div>
            {subtitle && <div className="mt-1 text-ink-muted">{subtitle}</div>}
            {meta && <div className="mt-1.5 text-small text-ink-subtle">{meta}</div>}
          </div>
          {actions && (
            <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>
        {tabs && <div className="mt-4">{tabs}</div>}
      </header>
    </>
  )
}
