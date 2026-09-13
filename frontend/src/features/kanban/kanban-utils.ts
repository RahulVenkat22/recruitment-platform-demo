import { DIALOG_MOVES, ORDER, TRAY } from '@/features/applications/pipeline-target'
import type { KanbanBoard, KanbanCard, KanbanColumnData } from '@/types/domain'

export const TRAY_KEY = 'tray'

export type DropKind =
  | { kind: 'none' }
  | { kind: 'forward'; status: string }
  | { kind: 'dialog'; status: string; dialog: (typeof DIALOG_MOVES)[string] }
  | { kind: 'note'; status: string }

/**
 * What dropping `card` into `column` should do (plan.md 9.7): forward drops apply
 * the column's entry status, columns that need data open their dialog, and
 * backward or tray drops open the transition dialog for a note or reason.
 */
export function classifyDrop(card: KanbanCard, column: KanbanColumnData): DropKind {
  if (column.statuses.includes(card.status)) return { kind: 'none' }
  const target = column.entry_status
  if (column.key === TRAY_KEY || TRAY.has(target)) return { kind: 'note', status: 'rejected' }
  if (TRAY.has(card.status) || card.status === 'onboarded') return { kind: 'note', status: target }
  const from = ORDER.indexOf(card.status)
  const to = ORDER.indexOf(target)
  if (to <= from) return { kind: 'note', status: target }
  const dialog = DIALOG_MOVES[target]
  if (dialog) return { kind: 'dialog', status: target, dialog }
  return { kind: 'forward', status: target }
}

/** Board with `cardId` moved into `columnKey` (optimistic update while the request runs). */
export function moveCard(
  board: KanbanBoard,
  cardId: string,
  columnKey: string,
  status: string,
): KanbanBoard {
  let moved: KanbanCard | undefined
  const strip = (column: KanbanColumnData): KanbanColumnData => {
    const cards = column.cards.filter((card) => {
      if (card.id !== cardId) return true
      moved = card
      return false
    })
    return cards.length === column.cards.length
      ? column
      : { ...column, cards, count: column.count - 1, total: column.total - 1 }
  }
  const columns = board.columns.map(strip)
  const tray = strip(board.tray)
  if (!moved) return board
  const card: KanbanCard = {
    ...moved,
    status: status as KanbanCard['status'],
    status_label: moved.status_label,
  }
  const add = (column: KanbanColumnData): KanbanColumnData =>
    column.key === columnKey
      ? {
          ...column,
          cards: [card, ...column.cards],
          count: column.count + 1,
          total: column.total + 1,
        }
      : column
  return { ...board, columns: columns.map(add), tray: add(tray) }
}

export function isOverdue(card: KanbanCard, now = Date.now()): boolean {
  return Boolean(card.next_action_at) && new Date(card.next_action_at as string).getTime() < now
}

export const MATCH_FLOORS = [0, 60, 70, 80, 90] as const
