import {
  ChevronsUpDownIcon,
  LogOutIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  SettingsIcon,
} from 'lucide-react'
import { Link, useMatch, useNavigate } from 'react-router'
import { NAV_ITEMS, type NavItem } from '@/app/layout/nav'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthStore } from '@/lib/auth-store'
import { fullName, initials } from '@/lib/format'
import { useUiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'

function SidebarNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const isActive = Boolean(useMatch({ path: item.to, end: false }))
  const Icon = item.icon

  const link = (
    <Link
      to={item.to}
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
  const clearSession = useAuthStore((state) => state.clearSession)
  const navigate = useNavigate()

  const name = user ? fullName(user) : 'Guest'
  const designation = user?.designation ?? 'Not signed in'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={collapsed ? `Account menu for ${name}` : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-control p-1.5 text-left',
            'transition-colors duration-150 ease-brand hover:bg-surface-2',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            collapsed && 'justify-center',
          )}
        >
          <Avatar size="default" className="shrink-0">
            {user?.avatar_url ? <AvatarImage src={user.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-surface-2 text-xs font-medium text-ink-muted">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{name}</span>
                <span className="block truncate text-caption text-ink-subtle">{designation}</span>
              </span>
              <ChevronsUpDownIcon className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuItem onSelect={() => navigate('/settings')}>
          <SettingsIcon aria-hidden="true" />
          Profile and settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            clearSession()
            navigate('/login')
          }}
        >
          <LogOutIcon aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function Sidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const ToggleIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-surface',
        'transition-[width] duration-250 ease-brand',
        collapsed ? 'w-16' : 'w-[248px]',
      )}
    >
      <div className={cn('flex h-14 items-center px-4', collapsed && 'justify-center px-0')}>
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-label="Aimious home"
        >
          <img
            src="/brand/aimious-mark-for-light-bg.svg"
            alt=""
            width={28}
            height={28}
            className="size-7"
          />
          {!collapsed && (
            <span className="text-[17px] font-medium tracking-[-0.01em] text-ink">Aimious</span>
          )}
        </Link>
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
