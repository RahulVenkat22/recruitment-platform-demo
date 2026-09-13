import { useDroppable } from '@dnd-kit/core'
import { ChevronRightIcon, RotateCcwIcon } from 'lucide-react'
import type { RowAction } from '@/components/shared/ActionMenu'
import { Button } from '@/components/ui/button'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import { KanbanCard } from '@/features/kanban/KanbanCard'
import { TRAY_KEY } from '@/features/kanban/kanban-utils'
import { cn } from '@/lib/utils'
import type { KanbanCard as KanbanCardData, KanbanColumnData } from '@/types/domain'

export interface KanbanTrayProps {
  tray: KanbanColumnData
  open: boolean
  onToggle: () => void
  filtered: boolean
  actions: ApplicationActionsHandle
  actionsFor: (card: KanbanCardData) => RowAction[]
  canTransition: boolean
}

/** plan.md 9.7: the collapsible Rejected / Withdrawn / On Hold tray with Resume and Reopen. */
export function KanbanTray({
  tray,
  open,
  onToggle,
  filtered,
  actions,
  actionsFor,
  canTransition,
}: KanbanTrayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY_KEY, data: { column: tray } })
  const count = filtered ? `${tray.count} of ${tray.total}` : String(tray.total)

  return (
    <aside
      ref={setNodeRef}
      data-slot="kanban-tray"
      data-open={open}
      className={cn(
        // `relative` keeps the collapsed toggle's sr-only text positioned inside the tray;
        // otherwise it lands against the viewport, off to the right of the scrolled board.
        'relative flex shrink-0 snap-start flex-col rounded-card border transition-[width] max-md:w-[85vw]',
        open ? 'w-[300px]' : 'w-14',
        isOver ? 'border-danger bg-danger-soft/40' : 'border-line bg-surface-2/60',
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2.5 text-left text-small font-medium text-ink hover:bg-surface-2"
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-ink-subtle transition-transform',
            open && 'rotate-180',
          )}
        />
        {open ? (
          <>
            <span className="flex-1">{tray.label}</span>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-surface px-1.5 text-caption text-ink-muted tabular-nums">
              {count}
            </span>
          </>
        ) : (
          <span className="sr-only">
            {tray.label} ({count})
          </span>
        )}
      </button>
      {!open && (
        <div className="flex flex-1 flex-col items-center gap-2 py-2" aria-hidden="true">
          <span className="text-caption text-ink-muted tabular-nums">{tray.total}</span>
          <span className="text-caption [writing-mode:vertical-rl] text-ink-subtle">
            {tray.label}
          </span>
        </div>
      )}
      {open && (
        <div className="flex flex-1 flex-col gap-2 px-2 pb-2">
          {tray.cards.length === 0 ? (
            <div className="rounded-card border border-dashed border-line-strong px-3 py-8 text-center text-caption text-ink-subtle">
              {isOver ? 'Drop to reject or hold' : 'Nobody parked here'}
            </div>
          ) : (
            tray.cards.map((card) => {
              const resumable = card.status === 'on_hold'
              const reopenable = card.status === 'rejected' || card.status === 'withdrawn'
              return (
                <div key={card.id} className="space-y-1">
                  <KanbanCard card={card} actions={actionsFor(card)} draggable={false} />
                  {canTransition && (resumable || reopenable) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      className="w-full"
                      onClick={() =>
                        resumable
                          ? actions.changeStatus(card, card.previous_status ?? undefined)
                          : actions.changeStatus(card, 'hr_review')
                      }
                    >
                      <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
                      {resumable ? 'Resume' : 'Reopen'}
                    </Button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </aside>
  )
}
