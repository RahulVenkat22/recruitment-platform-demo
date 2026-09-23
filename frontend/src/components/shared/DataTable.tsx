import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowSelectionState,
  type SortingState,
  type Updater,
} from '@tanstack/react-table'
import { XIcon } from 'lucide-react'
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Pagination } from '@/components/shared/Pagination'
import type { PaginationState } from '@/components/shared/pagination-utils'
import { SkeletonTableRows } from '@/components/shared/Skeletons'
import { ariaSort, nextSorting, type SortDirection } from '@/components/shared/sort-utils'
import { SortButton } from '@/components/shared/SortButton'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface ColumnMeta {
  align?: 'left' | 'right' | 'center'
  className?: string
}

export interface ControlledState<S> {
  state: S
  onChange: (next: S) => void
}

export interface BulkActionsContext<T> {
  selectedRows: T[]
  clear: () => void
}

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  'aria-label'?: string
  loading?: boolean
  /**
   * Server-side sorting: every column sorts unless its definition says
   * `enableSorting: false`; `sortDescFirst` makes the first click descending.
   * The table reports the requested sort and renders `aria-sort`.
   */
  sorting?: ControlledState<SortingState>
  /** Total rows on the server; pairs with `pagination`. */
  total?: number
  pagination?: PaginationState & { onChange: (state: PaginationState) => void }
  onRowClick?: (row: T) => void
  getRowId?: (row: T, index: number) => string
  rowSelection?: ControlledState<RowSelectionState>
  /** Rendered in the bulk bar while rows are selected. */
  bulkActions?: (context: BulkActionsContext<T>) => ReactNode
  /** Rendered inside the frame when there are no rows and nothing is loading. */
  emptyState?: ReactNode
  /** Search, filters and view toggles; rendered above the frame. */
  toolbar?: ReactNode
  skeletonRows?: number
  className?: string
}

const INTERACTIVE = 'a, button, input, select, textarea, label, [role="menu"], [role="menuitem"]'

function resolve<S>(updater: Updater<S>, previous: S): S {
  return typeof updater === 'function' ? (updater as (old: S) => S)(previous) : updater
}

function metaOf<T>(column: { columnDef: ColumnDef<T, unknown> }): ColumnMeta {
  return (column.columnDef.meta as ColumnMeta | undefined) ?? {}
}

function alignClass(meta: ColumnMeta): string | undefined {
  if (meta.align === 'right') return 'text-right'
  if (meta.align === 'center') return 'text-center'
  return undefined
}

/**
 * TanStack Table over the shadcn table (plan.md 8.4): header in surface-2,
 * sortable headers with a chevron and `aria-sort`, hover rows, clickable rows
 * that ignore clicks on their own controls, a bulk bar for selections, skeleton
 * rows while loading, and a pagination footer.
 */
export function DataTable<T>({
  columns,
  data,
  'aria-label': ariaLabel,
  loading = false,
  sorting,
  total,
  pagination,
  onRowClick,
  getRowId,
  rowSelection,
  bulkActions,
  emptyState,
  toolbar,
  skeletonRows = 8,
  className,
}: DataTableProps<T>) {
  const sortingState = sorting?.state ?? []
  const selectionState = rowSelection?.state ?? {}

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table's instance is not memoisable by design.
  const table = useReactTable({
    data,
    columns,
    state: { rowSelection: selectionState },
    manualPagination: true,
    enableRowSelection: Boolean(rowSelection),
    onRowSelectionChange: (updater) => rowSelection?.onChange(resolve(updater, selectionState)),
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  })

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>, row: Row<T>) {
    if (!onRowClick) return
    if ((event.target as HTMLElement).closest(INTERACTIVE)) return
    onRowClick(row.original)
  }

  function handleRowKey(event: KeyboardEvent<HTMLTableRowElement>, row: Row<T>) {
    if (!onRowClick || event.key !== 'Enter' || event.target !== event.currentTarget) return
    event.preventDefault()
    onRowClick(row.original)
  }

  const rows = table.getRowModel().rows
  const selectedRows = rowSelection
    ? table.getSelectedRowModel().rows.map((row) => row.original)
    : []
  const showEmpty = !loading && rows.length === 0
  const showSkeleton = loading && rows.length === 0

  return (
    <div data-slot="data-table" className={cn('space-y-3', className)}>
      {toolbar}
      {rowSelection && selectedRows.length > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="flex flex-wrap items-center gap-2 rounded-card border border-primary/30 bg-primary-soft px-3 py-2 text-small"
        >
          <span className="font-medium text-primary tabular-nums">
            {selectedRows.length} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions?.({ selectedRows, clear: () => rowSelection.onChange({}) })}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto text-ink-muted"
            onClick={() => rowSelection.onChange({})}
          >
            <XIcon data-icon="inline-start" aria-hidden="true" />
            Clear selection
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <Table aria-label={ariaLabel} aria-busy={loading || undefined} className="min-w-[640px]">
          <TableHeader className="bg-surface-2">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const meta = metaOf(header.column)
                  const { enableSorting = true, sortDescFirst = false } = header.column.columnDef
                  const canSort = Boolean(sorting) && !header.isPlaceholder && enableSorting
                  const current = sortingState.find((entry) => entry.id === header.column.id)
                  const direction: SortDirection = current ? (current.desc ? 'desc' : 'asc') : false
                  const label = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())
                  return (
                    <TableHead
                      key={header.id}
                      aria-sort={canSort ? ariaSort(direction) : undefined}
                      className={cn(
                        'h-10 text-caption font-medium tracking-[0.03em] text-ink-muted uppercase',
                        alignClass(meta),
                        meta.className,
                      )}
                    >
                      {canSort ? (
                        <SortButton
                          direction={direction}
                          onClick={() =>
                            sorting?.onChange(
                              nextSorting(sortingState, header.column.id, sortDescFirst),
                            )
                          }
                        >
                          {label}
                        </SortButton>
                      ) : (
                        label
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          {showSkeleton ? (
            <SkeletonTableRows rows={skeletonRows} columns={columns.length} />
          ) : (
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={(event) => handleRowClick(event, row)}
                  onKeyDown={(event) => handleRowKey(event, row)}
                  className={cn(
                    'transition-colors duration-150 ease-brand',
                    onRowClick &&
                      'cursor-pointer hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                    row.getIsSelected() && 'bg-primary-soft/60 hover:bg-primary-soft/80',
                    loading && 'opacity-60',
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = metaOf(cell.column)
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn('py-2.5 align-middle', alignClass(meta), meta.className)}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </TableBody>
          )}
        </Table>
        {showEmpty && emptyState && <div className="border-t border-line">{emptyState}</div>}
      </div>
      {pagination && total !== undefined && (total > 0 || loading) && (
        <Pagination
          pageIndex={pagination.pageIndex}
          pageSize={pagination.pageSize}
          total={total}
          onChange={pagination.onChange}
        />
      )}
    </div>
  )
}
