import { ArrowRightLeftIcon, ChevronDownIcon, Loader2Icon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMoves } from '@/features/applications/api'
import { DIALOG_MOVES } from '@/features/applications/pipeline-target'
import { StatusBadge } from '@/components/shared/StatusBadge'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import type { ApplicationRow, Move } from '@/types/domain'

const GROUPS: { kinds: string[]; label: string }[] = [
  { kinds: ['forward'], label: 'Forward' },
  { kinds: ['back', 'reset', 'resume', 'reopen'], label: 'Back' },
  { kinds: ['decision'], label: 'Decisions' },
]

export interface StatusTransitionMenuProps {
  application: ApplicationRow
  actions: ApplicationActionsHandle
  size?: 'sm' | 'default'
  variant?: 'default' | 'outline'
  className?: string
}

/**
 * plan.md 8.4 StatusTransitionMenu: allowed next statuses grouped as Forward,
 * Back and Decisions. Plain forward moves apply at once; moves that need a
 * note or reason open `TransitionDialog`; Contacted, Interview Scheduled,
 * Offer Sent and Onboarding open their own dialogs.
 */
export function StatusTransitionMenu({
  application,
  actions,
  size = 'default',
  variant = 'default',
  className,
}: StatusTransitionMenuProps) {
  const [open, setOpen] = useState(false)
  const moves = useMoves(application.id, open)
  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        moves: (moves.data ?? []).filter((move) => group.kinds.includes(move.kind)),
      })).filter((group) => group.moves.length > 0),
    [moves.data],
  )

  function pick(move: Move) {
    const dialog = DIALOG_MOVES[move.status]
    if (dialog === 'contact') return actions.logContact(application)
    if (dialog === 'interview') return actions.scheduleInterview(application)
    if (dialog === 'offer') return actions.makeOffer(application)
    if (dialog === 'onboarding') return actions.startOnboarding(application)
    if (move.requires) return actions.changeStatus(application, move.status)
    return void actions.transitionTo(application, move.status)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button type="button" size={size} variant={variant} className={className}>
          <ArrowRightLeftIcon data-icon="inline-start" aria-hidden="true" />
          Change status
          <ChevronDownIcon data-icon="inline-end" aria-hidden="true" className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        {moves.isPending && (
          <DropdownMenuItem disabled>
            <Loader2Icon aria-hidden="true" className="animate-spin" /> Loading moves…
          </DropdownMenuItem>
        )}
        {moves.isSuccess && moves.data.length === 0 && (
          <DropdownMenuItem disabled>No status change is possible from here.</DropdownMenuItem>
        )}
        {grouped.map((group, index) => (
          <DropdownMenuGroup key={group.label}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-caption tracking-[0.08em] text-ink-subtle uppercase">
              {group.label}
            </DropdownMenuLabel>
            {group.moves.map((move) => (
              <DropdownMenuItem
                key={move.status}
                variant={move.kind === 'decision' ? 'destructive' : 'default'}
                onSelect={() => pick(move)}
              >
                <StatusBadge status={move.status} size="sm" dot />
                <span className="sr-only">{move.label}</span>
                {move.kind !== 'forward' && move.kind !== 'decision' && (
                  <span className="ml-auto text-caption text-ink-subtle">
                    {move.label.replace(/\s*\(.*\)$/, '')}
                  </span>
                )}
                {DIALOG_MOVES[move.status] && (
                  <span className="ml-auto text-caption text-ink-subtle">…</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
