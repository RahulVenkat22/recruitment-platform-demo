import type { ColumnDef, Row } from '@tanstack/react-table'
import { ActionMenu, type RowAction } from '@/components/shared/ActionMenu'
import { Checkbox } from '@/components/ui/checkbox'

/* Column factories for DataTable (plan.md 8.4): the leading selection checkbox
 * and the trailing "⋯" row menu. Kept out of DataTable.tsx so pages that need
 * neither do not pay for them. */

export type { RowAction }

function defaultRowLabel(row: unknown, fallback: string): string {
  if (row && typeof row === 'object') {
    const record = row as Record<string, unknown>
    for (const key of ['title', 'name', 'full_name', 'label', 'email']) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value
    }
  }
  return fallback
}

export interface SelectionColumnOptions<T> {
  /** Accessible name for a row's checkbox: "Select {label}". Defaults to the row's title or name. */
  getLabel?: (row: T) => string
}

export function selectionColumn<T>(options: SelectionColumnOptions<T> = {}): ColumnDef<T, unknown> {
  return {
    id: 'select',
    enableSorting: false,
    size: 36,
    meta: { className: 'w-9 pr-0' },
    header: ({ table }) => (
      <Checkbox
        aria-label="Select all rows"
        checked={
          table.getIsAllRowsSelected()
            ? true
            : table.getIsSomeRowsSelected()
              ? 'indeterminate'
              : false
        }
        onCheckedChange={(value) => table.toggleAllRowsSelected(value === true)}
      />
    ),
    cell: ({ row }: { row: Row<T> }) => {
      const label = options.getLabel
        ? options.getLabel(row.original)
        : defaultRowLabel(row.original, `row ${row.index + 1}`)
      return (
        <Checkbox
          aria-label={`Select ${label}`}
          checked={row.getIsSelected()}
          disabled={!row.getCanSelect()}
          onCheckedChange={(value) => row.toggleSelected(value === true)}
        />
      )
    },
  }
}

export interface RowActionsColumnOptions<T> {
  /** Accessible name for the trigger. Defaults to "Actions for row {n}". */
  getLabel?: (row: T, index: number) => string
}

export function rowActionsColumn<T>(
  actions: (row: T) => RowAction[],
  options: RowActionsColumnOptions<T> = {},
): ColumnDef<T, unknown> {
  return {
    id: 'actions',
    enableSorting: false,
    size: 44,
    meta: { className: 'w-11 pl-0 text-right' },
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }: { row: Row<T> }) => {
      const label = options.getLabel
        ? options.getLabel(row.original, row.index)
        : `Actions for row ${row.index + 1}`
      return <ActionMenu items={actions(row.original)} label={label} />
    },
  }
}
