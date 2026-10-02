import {
  CalendarDaysIcon,
  ChevronDownIcon,
  LogOutIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
} from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { deriveBreadcrumbs } from '@/app/layout/breadcrumbs'
import { Avatar } from '@/components/shared/Avatar'
import { MobileNav } from '@/app/layout/Sidebar'
import { CommandPalette } from '@/components/shared/CommandPalette'
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
import { isAssistantShortcut, isPaletteShortcut } from '@/lib/keyboard'
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
            'ml-1 inline-flex items-center gap-2 rounded-full transition-shadow duration-150 ease-brand',
            'hover:ring-2 hover:ring-line-strong data-[state=open]:ring-2 data-[state=open]:ring-primary',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          )}
        >
          <Avatar name={name} src={user?.avatar_url} size="md" />
          <ChevronDownIcon
            aria-hidden="true"
            className="mr-1 size-3 text-ink-subtle max-sm:hidden"
          />
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
  const assistantOpen = useUiStore((state) => state.assistantOpen)
  const toggleAssistant = useUiStore((state) => state.toggleAssistant)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isPaletteShortcut(event)) {
        event.preventDefault()
        setPaletteOpen((value) => !value)
      } else if (isAssistantShortcut(event)) {
        event.preventDefault()
        toggleAssistant()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleAssistant])

  return (
    <header className="relative z-30 flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-line bg-surface/90 px-6 backdrop-blur-xl max-md:gap-2 max-md:px-3">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav />
        <div className="min-w-0 truncate">
          <div className="mb-0.5 text-[10px] font-medium tracking-[0.1em] text-ink-subtle uppercase max-md:hidden">
            TalentOS workspace
          </div>
          <TopBarBreadcrumbs />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="mr-2 hidden items-center gap-2 text-caption text-ink-subtle xl:inline-flex">
          <CalendarDaysIcon aria-hidden="true" className="size-3.5" />
          {new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }).format(new Date())}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-slot="assistant-launcher"
          aria-label="Ask TalentOS AI (Ctrl or ⌘ /)"
          aria-expanded={assistantOpen}
          aria-haspopup="dialog"
          className="h-9 gap-2 rounded-xl border-primary/20 bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary aria-expanded:bg-primary aria-expanded:text-white max-md:size-9 max-md:px-0"
          onClick={toggleAssistant}
        >
          <SparklesIcon aria-hidden="true" className="size-3.5" />
          <span className="max-md:hidden">Ask AI</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Search (Ctrl or ⌘ K)"
          className="h-9 gap-2 rounded-xl bg-surface-2/60 text-ink-muted md:min-w-48 md:justify-start max-md:size-9 max-md:px-0"
          onClick={() => setPaletteOpen(true)}
        >
          <SearchIcon aria-hidden="true" className="size-3.5" />
          <span className="mr-auto max-md:hidden">Find anything…</span>
          <kbd className="rounded-[4px] border border-line bg-surface-2 px-1 text-[10px] text-ink-subtle max-md:hidden">
            ⌘K
          </kbd>
        </Button>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <NotificationBell />
        <AccountMenu />
      </div>
    </header>
  )
}
