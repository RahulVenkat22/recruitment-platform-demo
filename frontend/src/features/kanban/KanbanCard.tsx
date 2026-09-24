import { useDraggable, type DraggableSyntheticListeners } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ClockIcon, GripVerticalIcon } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import { ActionMenu, type RowAction } from '@/components/shared/ActionMenu'
import { Avatar } from '@/components/shared/Avatar'
import { MatchRing } from '@/components/shared/MatchRing'
import { SourceBadge } from '@/components/shared/SourceBadge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { candidateHref, formatYears } from '@/features/applications/application-utils'
import { isOverdue } from '@/features/kanban/kanban-utils'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { KanbanCard as KanbanCardData } from '@/types/domain'

export interface KanbanCardProps {
  card: KanbanCardData
  actions?: RowAction[]
  draggable?: boolean
  /** Rendered inside the DragOverlay: lifted shadow and tilt, no drag handle wiring. */
  overlay?: boolean
  className?: string
}

interface CardBodyProps extends KanbanCardProps {
  dragHandle?: ReactNode
  /** Pointer listeners from useDraggable; spread on the card so it can be picked up anywhere. */
  dragListeners?: DraggableSyntheticListeners
  dragging?: boolean
  setNodeRef?: (node: HTMLElement | null) => void
  style?: CSSProperties
}

function CardBody({
  card,
  actions,
  overlay = false,
  className,
  dragHandle,
  dragListeners,
  dragging = false,
  setNodeRef,
  style,
}: CardBodyProps) {
  const overdue = isOverdue(card)
  const title = [card.candidate.current_title, card.candidate.current_company]
    .filter(Boolean)
    .join(' at ')

  return (
    <article
      ref={setNodeRef}
      data-slot="kanban-card"
      data-status={card.status}
      data-candidate={card.candidate.full_name}
      style={style}
      {...dragListeners}
      className={cn(
        'group/card relative rounded-card border border-line bg-surface p-3 shadow-card transition-[box-shadow,opacity]',
        dragListeners && 'cursor-grab',
        dragging && 'opacity-30',
        overlay && 'rotate-2 cursor-grabbing shadow-card-hover ring-2 ring-primary/30',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        {dragHandle}
        <Avatar name={card.candidate.full_name} src={card.candidate.avatar_url} size="md" />
        <div className="min-w-0 flex-1">
          <Link
            to={candidateHref(card)}
            className="block truncate text-small font-medium text-ink hover:underline"
          >
            {card.candidate.full_name}
          </Link>
          <p className="truncate text-caption text-ink-muted">{title || card.candidate.headline}</p>
        </div>
        {card.match && <MatchRing value={card.match.overall_pct} size="sm" />}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-caption text-ink-muted">
        <span className="tabular-nums">{formatYears(card.candidate.total_experience_years)}</span>
        <SourceBadge source={card.candidate.sources} iconOnly />
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <StatusBadge status={card.status} size="sm" dot />
        {card.next_action && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                data-slot="next-action"
                data-overdue={overdue}
                className={cn(
                  'inline-flex size-5 items-center justify-center rounded-full',
                  overdue ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-ink-subtle',
                )}
              >
                <ClockIcon aria-hidden="true" className="size-3" />
                <span className="sr-only">{overdue ? 'Overdue next action' : 'Next action'}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {card.next_action}
              {card.next_action_at ? ` · ${formatDateTime(card.next_action_at)}` : ''}
            </TooltipContent>
          </Tooltip>
        )}
        <span className="ml-auto flex items-center gap-1">
          {actions && actions.length > 0 && (
            <ActionMenu
              items={actions}
              label={`Actions for ${card.candidate.full_name}`}
              size="icon-xs"
            />
          )}
          {card.owner && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Avatar name={card.owner.full_name} src={card.owner.avatar_url} size="xs" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Owner: {card.owner.full_name}</TooltipContent>
            </Tooltip>
          )}
        </span>
      </div>
    </article>
  )
}

/**
 * The draggable card in a column: the whole card is the pointer drag surface
 * (clicks still reach the name and the menu thanks to the sensor's distance
 * constraint), and the grip is the keyboard handle and focus target.
 */
function DraggableCard(props: KanbanCardProps) {
  const { card, draggable = true } = props
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useDraggable({ id: card.id, data: { card }, disabled: !draggable })
  return (
    <CardBody
      {...props}
      setNodeRef={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      dragging={isDragging}
      dragListeners={draggable ? listeners : undefined}
      dragHandle={
        draggable ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            aria-label={`Drag ${card.candidate.full_name}`}
            className="-ml-1 mt-1 inline-flex size-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-control text-ink-subtle opacity-60 hover:bg-surface-2 hover:text-ink focus-visible:opacity-100 group-hover/card:opacity-100 active:cursor-grabbing"
            {...listeners}
            {...attributes}
          >
            <GripVerticalIcon aria-hidden="true" className="size-3.5" />
          </button>
        ) : undefined
      }
    />
  )
}

/**
 * plan.md 9.7 KanbanCard: avatar, name, match ring, title, years, sources,
 * status, ⋯ menu, owner. The DragOverlay copy (`overlay`) is a plain view so it
 * never registers with the DndContext under the real card's id.
 */
export function KanbanCard(props: KanbanCardProps) {
  return props.overlay ? <CardBody {...props} /> : <DraggableCard {...props} />
}
