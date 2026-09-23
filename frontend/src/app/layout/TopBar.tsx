import { LogOutIcon, SearchIcon, SettingsIcon } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { deriveBreadcrumbs } from '@/app/layout/breadcrumbs'
import { Avatar } from '@/components/shared/Avatar'
import { MobileNav } from '@/app/layout/Sidebar'
import { CommandPalette } from '@/components/shared/CommandPalette'
import { HealthPill } from '@/components/shared/HealthPill'
import { NotificationBell } from '@/components/shared/NotificationBell'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSignOut } from '@/features/auth/use-sign-out'
import { useAuthStore } from '@/lib/auth-store'
import { isPaletteShortcut } from '@/lib/keyboard'
import { useUiStore } from '@/lib/ui-store'
import { cn } from '@/lib/utils'

/** Crumbs published by the page's PageHeader win; the route supplies a fallback. */
function TopBarBreadcrumbs() {
  const published = useUiStore((state) => state.breadcrumbs)
  const { pathname } = useLocation()
  const crumbs = published.length > 0 ? published : deriveBreadcrumbs(pathname)
  if (crumbs.length === 0) return <div aria-hidden="true" />

  return (
    <Breadcrumb>
      <BreadcrumbList className="text-[13px]">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem>
                {isLast || !crumb.to ? (
                  <BreadcrumbPage className="font-medium">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.to}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/** The signed-in person's avatar opens the account menu: who they are, settings and sign out. */
function AccountMenu() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const { signOut, pending } = useSignOut()
  const name = user?.full_name ?? 'Guest'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu for ${name}`}
          className={cn(
            'ml-1 inline-flex rounded-full transition-shadow duration-150 ease-brand',
            'hover:ring-2 hover:ring-line-strong data-[state=open]:ring-2 data-[state=open]:ring-primary',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        >
          <Avatar name={name} src={user?.avatar_url} size="md" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <span className="block truncate text-[13px] font-medium text-ink">{name}</span>
          <span className="block truncate text-caption text-ink-muted">{user?.designation}</span>
          <span className="block truncate text-caption text-ink-subtle">{user?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
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

export function TopBar() {
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return
      event.preventDefault()
      setPaletteOpen((value) => !value)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-6 max-md:gap-2 max-md:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        <div className="min-w-0 truncate">
          <TopBarBreadcrumbs />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Search (Ctrl or ⌘ K)"
          className="gap-2 text-ink-muted max-md:size-7 max-md:px-0"
          onClick={() => setPaletteOpen(true)}
        >
          <SearchIcon aria-hidden="true" className="size-3.5" />
          <span className="max-md:hidden">Search</span>
          <kbd className="rounded-[4px] border border-line bg-surface-2 px-1 text-[10px] text-ink-subtle max-md:hidden">
            ⌘K
          </kbd>
        </Button>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <div className="max-md:hidden">
          <HealthPill />
        </div>
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  )
}
