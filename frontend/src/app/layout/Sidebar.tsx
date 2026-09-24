import { ChevronLeftIcon, MenuIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useMatch } from 'react-router'
import { NAV_SECTIONS, navItemsFor, type NavItem } from '@/app/layout/nav'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { TalentOSLogo, TalentOSMark } from '@/components/shared/TalentOSLogo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUnreadCount } from '@/features/notifications/api'
import { useAuthStore } from '@/lib/auth-store'
import { useUiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/types/domain'

function SidebarNavItem({
  item,
  collapsed,
  count = 0,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  /** A number to show after the label (unread notifications); zero hides it. */
  count?: number
  onNavigate?: () => void
}) {
  const isActive = Boolean(useMatch({ path: item.to, end: item.end ?? false }))
  const Icon = item.icon
  const tooltip = count > 0 ? `${item.label} (${count} unread)` : item.label

  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative flex h-10 items-center gap-3 rounded-card px-3 text-[13.5px] font-medium text-ink-muted',
        'transition-colors duration-150 ease-brand hover:bg-surface-2 hover:text-ink',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        isActive && 'bg-surface-2 text-ink',
        collapsed && 'w-10 justify-center px-0',
      )}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute top-2.5 bottom-2.5 -left-3 w-[3px] rounded-r-full bg-accent"
        />
      )}
      <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
      {count > 0 && (
        <span
          data-slot="nav-count"
          aria-label={`${count} unread`}
          className={cn(
            'inline-flex items-center justify-center rounded-pill bg-primary font-medium text-white tabular-nums',
            collapsed
              ? 'absolute top-1 right-1 h-4 min-w-4 px-1 text-[10px] leading-none ring-2 ring-surface'
              : 'ml-auto h-5 min-w-5 px-1.5 text-[11px] leading-none',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

/** This user's items in their sections; a section they have nothing in is not shown. */
function SidebarNav({
  user,
  collapsed,
  onNavigate,
}: {
  user: SessionUser | null
  collapsed: boolean
  onNavigate?: () => void
}) {
  const items = navItemsFor(user)
  const unread = useUnreadCount(user !== null).data?.unread ?? 0
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: items.filter((item) => item.section === section.key),
  })).filter((section) => section.items.length > 0)

  return (
    <nav
      aria-label="Primary"
      className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin]"
    >
      {sections.map((section, index) => (
        <div key={section.key}>
          {collapsed ? (
            index > 0 && <div aria-hidden="true" className="mx-2 my-2 h-px bg-line" />
          ) : (
            <p
              className={cn(
                'px-3 pb-1.5 text-[11px] font-semibold tracking-[0.12em] text-ink-subtle uppercase',
                index > 0 ? 'pt-5' : 'pt-1',
              )}
            >
              {section.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.to}>
                <SidebarNavItem
                  item={item}
                  collapsed={collapsed}
                  count={item.to === '/notifications' ? unread : 0}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/** Buro Happold over TalentOS, as on the login page; the two marks stacked when collapsed. */
function BrandLink({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean
  onNavigate?: () => void
}) {
  return (
    <Link
      to="/"
      onClick={onNavigate}
      aria-label="Buro Happold homepage"
      className={cn(
        'flex items-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        !collapsed && 'w-full',
      )}
    >
      {collapsed ? (
        <span className="flex flex-col items-center gap-2">
          <BrandLogo variant="mark" className="size-8" />
          <TalentOSMark size={32} />
        </span>
      ) : (
        <span className="flex w-full min-w-0 flex-col items-center gap-1.5">
          <BrandLogo variant="wordmark" className="h-auto w-full" />
          <TalentOSLogo on="light" size="sm" />
        </span>
      )}
    </Link>
  )
}

/**
 * Desktop sidebar: 256px expanded, 64px icon-only, white on the stone page. The
 * Buro Happold wordmark over the TalentOS logo heads it and the nav sits in
 * labelled sections. The collapse toggle rides the edge at the foot of the header.
 * Hidden below 768px, where `MobileNav` takes over.
 */
export function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-surface max-md:hidden',
        'transition-[width] duration-250 ease-brand',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div
        className={cn(
          // Tall enough for the full-width wordmark over the TalentOS logo, and fixed so
          // collapsing (a narrower stack) does not move the nav.
          'relative flex h-[128px] shrink-0 items-center border-b border-line px-5',
          collapsed && 'justify-center px-0',
        )}
      >
        <BrandLink collapsed={collapsed} />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={toggleLabel}
              aria-pressed={collapsed}
              onClick={toggleSidebar}
              className={cn(
                // Half outside the panel, centred on the corner where the header line meets the
                // edge, and above the pages' sticky headers (z-10), which otherwise paint over it.
                'absolute right-0 bottom-0 z-20 flex size-7 translate-x-1/2 translate-y-1/2 items-center justify-center',
                'rounded-full border border-line bg-surface text-ink-muted shadow-card',
                'transition-[background-color,border-color,color,box-shadow,scale] duration-200 ease-brand',
                'hover:border-primary hover:bg-primary hover:text-white hover:shadow-card-hover active:scale-95',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              )}
            >
              <ChevronLeftIcon
                className={cn(
                  'size-3.5 transition-transform duration-300 ease-brand',
                  collapsed && 'rotate-180',
                )}
                strokeWidth={2.25}
                aria-hidden="true"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{toggleLabel}</TooltipContent>
        </Tooltip>
      </div>

      <SidebarNav user={user} collapsed={collapsed} />
    </aside>
  )
}

/**
 * Phone navigation: a menu button in the top bar opens a left drawer with the
 * same sections as the sidebar. Closes on navigation.
 */
export function MobileNav() {
  const user = useAuthStore((state) => state.user)
  const { pathname } = useLocation()
  // The drawer remembers the route it was opened on, so any navigation (a link
  // inside it, browser back) dismisses it without an effect.
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const open = openedAt === pathname
  const close = () => setOpenedAt(null)

  return (
    <Sheet open={open} onOpenChange={(next) => setOpenedAt(next ? pathname : null)}>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Open navigation"
        aria-expanded={open}
        className="md:hidden"
        onClick={() => setOpenedAt(pathname)}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
      <SheetContent
        side="left"
        className="w-[280px] gap-0 bg-surface p-0 text-ink sm:max-w-[280px]"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Main sections of the app</SheetDescription>
        <div className="flex min-h-[128px] items-center border-b border-line py-4 pr-14 pl-5">
          <BrandLink onNavigate={close} />
        </div>
        <SidebarNav user={user} collapsed={false} onNavigate={close} />
      </SheetContent>
    </Sheet>
  )
}
