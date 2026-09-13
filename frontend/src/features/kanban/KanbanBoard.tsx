import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  type Active,
  type Announcements,
  type CollisionDetection,
  type Over,
  type ScreenReaderInstructions,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useTransition } from '@/features/applications/api'
import { toTarget } from '@/features/applications/pipeline-target'
import type { ApplicationActionsHandle } from '@/features/applications/useApplicationActions'
import { KanbanCard } from '@/features/kanban/KanbanCard'
import { KanbanColumn } from '@/features/kanban/KanbanColumn'
import { KanbanTray } from '@/features/kanban/KanbanTray'
import { classifyDrop, moveCard, TRAY_KEY } from '@/features/kanban/kanban-utils'
import { statusMeta } from '@/lib/enums'
import { describeError } from '@/lib/errors'
import { qk } from '@/lib/query-keys'
import { cn } from '@/lib/utils'
import type {
  JobDetail,
  KanbanBoard as KanbanBoardData,
  KanbanCard as KanbanCardData,
  KanbanColumnData,
} from '@/types/domain'

/** Drop where the pointer is; fall back to rectangle overlap for keyboard drags. */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : rectIntersection(args)
}

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'To pick up a candidate card, press Space or Enter. While dragging, use the arrow keys to move the card over another column, press Space or Enter again to drop it there, or press Escape to cancel.',
}

/** The card behind a draggable (`useDraggable({ data: { card } })`). */
function activeCard(active: Active): KanbanCardData | undefined {
  return (active.data.current as { card?: KanbanCardData } | undefined)?.card
}

/** The column behind a droppable (`useDroppable({ data: { column } })`); the tray is one too. */
function overColumn(over: Over | null): KanbanColumnData | undefined {
  return (over?.data.current as { column?: KanbanColumnData } | undefined)?.column
}

export interface KanbanBoardProps {
  job: JobDetail
  board: KanbanBoardData
  filtered: boolean
  actions: ApplicationActionsHandle
  onAddCandidate?: () => void
  /** Column to scroll into view on phones (the column switcher). */
  focusColumn?: string
  className?: string
}

/**
 * plan.md 9.7 KanbanBoard: eight droppable columns plus the tray. Forward drops
 * apply the column's entry status optimistically; columns that need data open
 * the matching dialog first (cancelling snaps the card back); backward and tray
 * drops open the transition dialog for a note or reason.
 */
export function KanbanBoard({
  job,
  board: serverBoard,
  filtered,
  actions,
  onAddCandidate,
  focusColumn,
  className,
}: KanbanBoardProps) {
  const client = useQueryClient()
  const transition = useTransition()
  const canDrag = job.permissions.can_work_pipeline && job.status !== 'archived'
  // Optimistic state remembers the server board it was built on; a fresh server board wins.
  const [override, setOverride] = useState<{
    base: KanbanBoardData
    board: KanbanBoardData
  } | null>(null)
  const [active, setActive] = useState<KanbanCardData | null>(null)
  const [trayOpen, setTrayOpen] = useState(false)
  const board = override && override.base === serverBoard ? override.board : serverBoard

  useEffect(() => {
    if (!focusColumn) return
    document
      .querySelector(`[data-slot="kanban-column"][data-column="${focusColumn}"]`)
      ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }, [focusColumn])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )
  const cardsById = useMemo(() => {
    const map = new Map<string, KanbanCardData>()
    for (const column of [...board.columns, board.tray])
      for (const card of column.cards) map.set(card.id, card)
    return map
  }, [board])

  // Live-region sentences for keyboard and screen-reader users: each names the
  // candidate and the column, and the drop sentence says what actually happens.
  const announcements = useMemo<Announcements>(() => {
    const columnOf = (card: KanbanCardData) =>
      board.columns.find((column) => column.statuses.includes(card.status)) ?? board.tray
    const name = (active: Active) => activeCard(active)?.candidate.full_name ?? 'the candidate'
    const home = (active: Active) => {
      const card = activeCard(active)
      return card ? columnOf(card).label : 'its column'
    }
    return {
      onDragStart: ({ active }) => `Picked up ${name(active)} from ${home(active)}.`,
      onDragOver: ({ active, over }) => {
        const column = overColumn(over)
        return column
          ? `${name(active)} is over ${column.label}.`
          : `${name(active)} is not over a column.`
      },
      onDragEnd: ({ active, over }) => {
        const card = activeCard(active)
        const column = overColumn(over)
        if (!card || !column) {
          return `Dropped ${name(active)} outside the columns; it stays in ${home(active)}.`
        }
        const drop = classifyDrop(card, column)
        if (drop.kind === 'none') return `${card.candidate.full_name} stays in ${column.label}.`
        if (drop.kind === 'forward') return `Moved ${card.candidate.full_name} to ${column.label}.`
        return `Dropped ${card.candidate.full_name} on ${column.label}. Complete the dialog to finish the move.`
      },
      onDragCancel: ({ active }) => `Cancelled; ${name(active)} returned to ${home(active)}.`,
    }
  }, [board])

  function onDragStart(event: DragStartEvent) {
    setActive(cardsById.get(String(event.active.id)) ?? null)
  }

  async function onDragEnd(event: DragEndEvent) {
    setActive(null)
    const card = cardsById.get(String(event.active.id))
    const columnKey = event.over ? String(event.over.id) : null
    if (!card || !columnKey) return
    const column =
      columnKey === TRAY_KEY ? board.tray : board.columns.find((entry) => entry.key === columnKey)
    if (!column) return
    const drop = classifyDrop(card, column)
    if (drop.kind === 'none') return
    // Dialogs open on the next tick: mounting a modal inside dnd-kit's drop
    // handler leaves the sensors unable to start the next drag.
    if (drop.kind === 'dialog') {
      const target = toTarget(card)
      window.setTimeout(() => {
        if (drop.dialog === 'contact') actions.logContact(target)
        else if (drop.dialog === 'interview') actions.scheduleInterview(target)
        else if (drop.dialog === 'offer') actions.makeOffer(target)
        else actions.startOnboarding(target)
      }, 0)
      return
    }
    if (drop.kind === 'note') {
      window.setTimeout(() => actions.changeStatus(card, drop.status), 0)
      return
    }
    setOverride({ base: serverBoard, board: moveCard(board, card.id, column.key, drop.status) })
    try {
      await transition.mutateAsync({ id: card.id, status: drop.status })
      toast.success(`Moved ${card.candidate.full_name} to ${statusMeta(drop.status).label}`)
    } catch (error) {
      setOverride(null)
      toast.error(describeError(error))
      void client.invalidateQueries({ queryKey: qk.jobs.detail(job.id) })
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
    >
      <div
        data-slot="kanban-board"
        className={cn(
          'flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 max-md:-mx-4 max-md:px-4 md:snap-none',
          className,
        )}
      >
        {board.columns.map((column) => (
          <KanbanColumn
            key={column.key}
            column={column}
            filtered={filtered}
            draggable={canDrag}
            actionsFor={(card) => actions.itemsFor(card)}
            onAdd={column.key === 'new' && canDrag ? onAddCandidate : undefined}
          />
        ))}
        <KanbanTray
          tray={board.tray}
          open={trayOpen}
          onToggle={() => setTrayOpen((value) => !value)}
          filtered={filtered}
          actions={actions}
          actionsFor={(card) => actions.itemsFor(card)}
          canTransition={canDrag}
        />
      </div>
      <DragOverlay dropAnimation={null}>
        {active ? <KanbanCard card={active} overlay className="w-[264px]" /> : null}
      </DragOverlay>
    </DndContext>
  )
}
