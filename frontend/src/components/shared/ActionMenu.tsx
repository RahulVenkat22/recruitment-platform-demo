import { EllipsisIcon, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface RowAction {
  key: string
  label: string
  onSelect?: () => void
  /** Navigates instead of calling onSelect. */
  href?: string
  icon?: LucideIcon
  destructive?: boolean
  disabled?: boolean
  /** Draws a separator above this item (groups "Delete" away from the rest). */
  separatorBefore?: boolean
  /** Small heading rendered above this item. */
  groupLabel?: string
}

export interface ActionMenuProps {
  items: RowAction[]
  /** Accessible name of the trigger button. */
  label: string
  size?: 'icon-xs' | 'icon-sm' | 'icon'
  variant?: 'ghost' | 'outline'
  align?: 'start' | 'end'
  className?: string
}

/** The "⋯" menu used by table rows, cards and page headers. Renders nothing when there are no items. */
export function ActionMenu({
  items,
  label,
  size = 'icon-sm',
  variant = 'ghost',
  align = 'end',
  className,
}: ActionMenuProps) {
  if (items.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          aria-label={label}
          className={className}
        >
          <EllipsisIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-48">
        {items.map((item) => {
          const Icon = item.icon
          const content = (
            <>
              {Icon && <Icon aria-hidden="true" />}
              {item.label}
            </>
          )
          return (
            <div key={item.key}>
              {item.separatorBefore && <DropdownMenuSeparator />}
              {item.groupLabel && (
                <DropdownMenuLabel className="text-caption text-ink-subtle uppercase">
                  {item.groupLabel}
                </DropdownMenuLabel>
              )}
              {item.href && !item.disabled ? (
                <DropdownMenuItem asChild variant={item.destructive ? 'destructive' : 'default'}>
                  <Link to={item.href}>{content}</Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant={item.destructive ? 'destructive' : 'default'}
                  disabled={item.disabled}
                  onSelect={() => item.onSelect?.()}
                >
                  {content}
                </DropdownMenuItem>
              )}
            </div>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
