import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SettingsIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useMatch, useNavigate } from 'react-router'
import { NAV_ITEMS, type NavItem } from '@/app/layout/nav'
import { Avatar } from '@/components/shared/Avatar'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { TalentOSLogo, TalentOSMark } from '@/components/shared/TalentOSLogo'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSignOut } from '@/features/auth/use-sign-out'
import { useAuthStore } from '@/lib/auth-store'
import { useUiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { personFromUser } from '@/types/domain'

function SidebarNavItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate?: () => void
}) {
  const isActive = Boolean(useMatch({ path: item.to, end: item.end ?? false }))
  const Icon = item.icon

  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative flex h-9 items-center gap-3 rounded-control px-2.5 text-[13.5px] font-medium text-ink-muted',
        'transition-colors duration-150 ease-brand hover:bg-surface-2 hover:text-ink',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        isActive && 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary',
        collapsed && 'justify-center px-0',
      )}
    >
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 bottom-1.5 -left-2 w-[3px] rounded-r-full bg-primary"
        />
      )}
      <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
    </Link>
  )

  if (!collapsed) return link
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={10}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  )
}

function SidebarUserMenu({ collapsed }: { collapsed: boolean }) {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const { signOut, pending } = useSignOut()

  const person = user
    ? personFromUser(user)
    : { id: 'guest', name: 'Guest', avatar_url: null, designation: 'Not signed in' }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${person.name}`}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-control p-1.5 text-left',
            'transition-colors duration-150 ease-brand hover:bg-surface-2',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            collapsed && 'justify-center',
          )}
        >
          {collapsed ? (
            <Avatar name={person.name} src={person.avatar_url} size="md" />
          ) : (
            <>
              <UserChip user={person} size="md" layout="stacked" showRole className="flex-1" />
              <ChevronsUpDownIcon className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        {user && (
          <>
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-[13px] font-medium text-ink">{person.name}</span>
              <span className="block truncate text-caption text-ink-subtle">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <SettingsIcon aria-hidden="true" />
          Profile and settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={pending} onSelect={() => void signOut()}>
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      className="flex min-w-0 items-center gap-2.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      aria-label="Buro Happold homepage"
    >
      {collapsed ? (
        <span className="flex flex-col items-center gap-2">
          <BrandLogo variant="mark" className="size-8" />
          <TalentOSMark size={32} />
        </span>
      ) : (
        <span className="flex min-w-0 flex-col gap-1.5">
          <BrandLogo variant="wordmark" on="dark" className="h-[52px]" />
          <TalentOSLogo on="dark" size="sm" className="pl-0.5" />
        </span>
      )}
    </Link>
  )
}

/**
 * Desktop sidebar (plan.md 8.4): 248px expanded, 64px icon-only, on Buro Happold
 * graphite with the lime as the active colour (`data-surface="dark"` re-points
 * the colour tokens). Hidden below 768px, where `MobileNav` takes over.
 */
export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <aside
      data-collapsed={collapsed}
      data-surface="dark"
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-surface max-md:hidden',
        'transition-[width] duration-250 ease-brand',
        collapsed ? 'w-16' : 'w-[248px]',
      )}
    >
      <div
        className={cn(
          'flex h-[104px] items-center border-b border-line px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <BrandLink collapsed={collapsed} />
      </div>

      <nav aria-label="Primary" className="flex-1 space-y-0.5 px-2 pt-2">
        {NAV_ITEMS.map((item) => (
          <SidebarNavItem key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div className="space-y-1 border-t border-line p-2">
        <SidebarUserMenu collapsed={collapsed} />
        <div className={cn('flex', collapsed ? 'justify-center' : 'justify-end')}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={toggleLabel}
                aria-pressed={collapsed}
                onClick={toggleSidebar}
                className="text-ink-subtle hover:text-ink"
              >
                <ToggleIcon aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{toggleLabel}</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  )
}

/**
 * Phone navigation: a menu button in the top bar opens a left drawer with the
 * same items and account menu as the sidebar. Closes on navigation.
 */
export function MobileNav() {
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
        data-surface="dark"
        className="w-[280px] gap-0 bg-surface p-0 text-ink sm:max-w-[280px]"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Main sections of the app</SheetDescription>
        <div className="flex h-[104px] items-center border-b border-line px-4">
          <BrandLink onNavigate={close} />
        </div>
        <nav aria-label="Primary" className="flex-1 space-y-0.5 px-2 pt-2">
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem key={item.to} item={item} collapsed={false} onNavigate={close} />
          ))}
        </nav>
        <div className="border-t border-line p-2">
          <SidebarUserMenu collapsed={false} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
