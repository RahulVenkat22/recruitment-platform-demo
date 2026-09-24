import {
  ArrowUpRightIcon,
  ChevronLeftIcon,
  MenuIcon,
  SettingsIcon,
  SparklesIcon,
} from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useState } from 'react'
import { Link, useLocation, useMatch } from 'react-router'
import { NAV_SECTIONS, navItemsFor, type NavItem } from '@/app/layout/nav'
import { Avatar } from '@/components/shared/Avatar'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { TalentOSLogo } from '@/components/shared/TalentOSLogo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useUnreadCount } from '@/features/notifications/api'
import { useAuthStore } from '@/lib/auth-store'
import { useMotionPreference } from '@/lib/hooks/useMotionPreference'
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
  count?: number
  onNavigate?: () => void
}) {
  const active = Boolean(useMatch({ path: item.to, end: item.end ?? false }))
  const reduced = useMotionPreference()
  const Icon = item.icon
  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'sidebar-link relative flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-[#adbfcc] hover:bg-white/[0.06] hover:text-white',
        collapsed && 'w-11 justify-center px-0',
      )}
    >
      {active && (
        <motion.span
          layoutId={reduced ? undefined : 'active-navigation'}
          aria-hidden="true"
          className="absolute inset-0 -z-10 rounded-xl border border-[#d7e96c]/15 bg-[#d7e96c]/10"
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
        />
      )}
      <Icon className="size-[18px] shrink-0" strokeWidth={1.7} aria-hidden="true" />
      <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
      {item.to === '/search' && !collapsed && (
        <span
          aria-hidden="true"
          className="ml-auto rounded-md bg-[#d7e96c]/10 px-1.5 py-0.5 text-[9px] tracking-wide text-[#d7e96c]"
        >
          AI
        </span>
      )}
      {count > 0 && (
        <span
          data-slot="nav-count"
          aria-label={`${count} unread`}
          className={cn(
            'inline-flex min-w-5 items-center justify-center rounded-md bg-accent px-1.5 text-[10px] font-semibold text-[#142d3d]',
            collapsed ? 'absolute top-0 right-0 h-4' : 'ml-auto h-5',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  )
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {item.label}
        {count > 0 ? ` (${count} unread)` : ''}
      </TooltipContent>
    </Tooltip>
  ) : (
    link
  )
}

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
  })).filter((section) => section.items.length)
  return (
    <LayoutGroup id={onNavigate ? 'mobile-nav' : 'desktop-nav'}>
      <nav
        aria-label="Primary"
        className={cn('min-h-0 flex-1 overflow-y-auto py-3', collapsed ? 'px-3' : 'px-4')}
      >
        {sections.map((section, index) => (
          <div key={section.key} className={index > 0 ? 'mt-4' : ''}>
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-[#829cac] uppercase">
                {section.label}
              </p>
            )}
            <ul className="space-y-1">
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
    </LayoutGroup>
  )
}

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
      className="flex min-w-0 items-center gap-3 rounded-lg"
    >
      {collapsed ? (
        <BrandLogo variant="mark" className="size-9" />
      ) : (
        <span className="flex flex-col gap-3">
          <BrandLogo on="dark" className="h-auto w-[158px]" />
          <span className="flex items-center gap-2">
            <TalentOSLogo on="dark" size="sm" />
            <span className="ml-1 rounded border border-white/15 px-1.5 py-0.5 text-[8px] tracking-[0.08em] text-[#afc4cd] uppercase">
              Workspace
            </span>
          </span>
        </span>
      )}
    </Link>
  )
}

function SidebarFooter({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const user = useAuthStore((state) => state.user)
  return (
    <div className={cn('shrink-0 border-t border-white/10', collapsed ? 'p-3' : 'p-4')}>
      {!collapsed && (
        <Link
          to="/search"
          onClick={onNavigate}
          className="sidebar-tip group mb-3 block rounded-2xl border border-white/10 bg-white/[0.045] p-3 transition-colors hover:bg-white/[0.08]"
        >
          <span className="flex items-center gap-2 text-[12px] font-medium text-white">
            <SparklesIcon className="size-4 text-accent" /> Your next great hire starts here.
          </span>
          <span className="mt-2 block text-[11px]/5 text-[#a5bbc7]">
            Find the people behind your next great team.
          </span>
          <span className="mt-2 flex items-center gap-2 text-[11px] font-medium text-[#dce98c]">
            Explore AI search{' '}
            <ArrowUpRightIcon className="size-3 transition-transform group-hover:translate-x-1" />
          </span>
        </Link>
      )}
      <Link
        to="/settings"
        onClick={onNavigate}
        aria-label="Profile and settings"
        className="flex min-w-0 items-center gap-2.5 rounded-xl p-1 text-white transition-colors hover:bg-white/5"
      >
        <Avatar name={user?.full_name ?? 'Your profile'} src={user?.avatar_url} size="md" />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium">{user?.full_name}</span>
              <span className="block truncate text-[10px] text-[#a5bbc7]">
                {user?.designation || 'Your workspace'}
              </span>
            </span>
            <SettingsIcon aria-hidden="true" className="size-4 text-[#a5bbc7]" />
          </>
        )}
      </Link>
    </div>
  )
}

export function Sidebar() {
  const user = useAuthStore((state) => state.user)
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  return (
    <aside
      data-collapsed={collapsed}
      data-surface="dark"
      className={cn(
        'workspace-sidebar relative z-20 flex h-full shrink-0 flex-col text-white transition-[width] duration-300 ease-brand max-md:hidden',
        collapsed ? 'w-[72px]' : 'w-[248px]',
      )}
    >
      <div
        className={cn(
          'relative flex h-[120px] shrink-0 items-center border-b border-white/10',
          collapsed ? 'justify-center px-2' : 'px-7',
        )}
      >
        <BrandLink collapsed={collapsed} />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              onClick={toggleSidebar}
              className="absolute right-0 bottom-0 z-20 flex size-6 translate-x-1/2 translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-muted shadow-card transition-colors hover:bg-accent hover:text-graphite"
            >
              <ChevronLeftIcon
                aria-hidden="true"
                className={cn(
                  'size-3.5 transition-transform duration-300',
                  collapsed && 'rotate-180',
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          </TooltipContent>
        </Tooltip>
      </div>
      <SidebarNav user={user} collapsed={collapsed} />
      <SidebarFooter collapsed={collapsed} />
    </aside>
  )
}

export function MobileNav() {
  const user = useAuthStore((state) => state.user)
  const { pathname } = useLocation()
  const [openedAt, setOpenedAt] = useState<string | null>(null)
  const open = openedAt === pathname
  const close = () => setOpenedAt(null)
  return (
    <Sheet open={open} onOpenChange={(next) => setOpenedAt(next ? pathname : null)}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Open navigation"
        aria-expanded={open}
        className="md:hidden"
        onClick={() => setOpenedAt(pathname)}
      >
        <MenuIcon aria-hidden="true" />
      </Button>
      <SheetContent
        side="left"
        data-surface="dark"
        className="workspace-sidebar w-[280px] gap-0 border-white/10 p-0 text-white sm:max-w-[280px]"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Main sections of the app</SheetDescription>
        <div className="flex h-[120px] shrink-0 items-center border-b border-white/10 px-7">
          <BrandLink onNavigate={close} />
        </div>
        <SidebarNav user={user} collapsed={false} onNavigate={close} />
        <SidebarFooter collapsed={false} onNavigate={close} />
      </SheetContent>
    </Sheet>
  )
}
