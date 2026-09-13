import { useDroppable } from '@dnd-kit/core'
import { PlusIcon } from 'lucide-react'
import type { RowAction } from '@/components/shared/ActionMenu'
import { Button } from '@/components/ui/button'
import { KanbanCard } from '@/features/kanban/KanbanCard'
import { cn } from '@/lib/utils'
import type { KanbanCard as KanbanCardData, KanbanColumnData } from '@/types/domain'

export interface KanbanColumnProps {
  column: KanbanColumnData
  filtered: boolean
  actionsFor?: (card: KanbanCardData) => RowAction[]
  draggable: boolean
  onAdd?: () => void
  className?: string
}

/** One board column (plan.md 9.7): header with label, count pill, "+", and a droppable card list. */
export function KanbanColumn({
  column,
  filtered,
  actionsFor,
  draggable,
  onAdd,
  className,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key, data: { column } })
  const count = filtered ? `${column.count} of ${column.total}` : String(column.total)

  return (
    <section
      data-slot="kanban-column"
      data-column={column.key}
      aria-label={`${column.label} column`}
      className={cn(
        'flex w-[280px] shrink-0 snap-start flex-col rounded-card border bg-surface-2/60 max-md:w-[85vw]',
        isOver ? 'border-primary bg-primary-soft/40' : 'border-line',
        className,
      )}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <h3 className="min-w-0 truncate text-small font-medium text-ink">{column.label}</h3>
        <span
          data-slot="column-count"
          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-surface px-1.5 text-caption text-ink-muted tabular-nums"
        >
          {count}
        </span>
        {onAdd && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto shrink-0"
            aria-label={`Add a candidate to ${column.label}`}
            onClick={onAdd}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        )}
      </header>
      <div ref={setNodeRef} className="flex min-h-40 flex-1 flex-col gap-2 px-2 pb-2">
        {column.cards.length === 0 ? (
          <div
            className={cn(
              'flex flex-1 items-center justify-center rounded-card border border-dashed px-3 py-8 text-caption',
              isOver ? 'border-primary text-primary' : 'border-line-strong text-ink-subtle',
            )}
          >
            {isOver
              ? 'Drop here'
              : filtered && column.total > 0
                ? 'No matches'
                : 'Empty · drop here'}
          </div>
        ) : (
          column.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              actions={actionsFor?.(card)}
              draggable={draggable}
            />
          ))
        )}
      </div>
    </section>
  )
}
