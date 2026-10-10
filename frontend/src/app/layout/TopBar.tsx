import {
  CalendarDaysIcon,
  ChevronDownIcon,
  LogOutIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Avatar } from '@/components/shared/Avatar'
import { MobileNav } from '@/app/layout/Sidebar'
import { CommandPalette } from '@/components/shared/CommandPalette'
import { NotificationBell } from '@/components/shared/NotificationBell'
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
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface/90 px-6 backdrop-blur-xl max-md:gap-2 max-md:px-3">
      <MobileNav />
      <div className="ml-auto flex items-center gap-3">
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
