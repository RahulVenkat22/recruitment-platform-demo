import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ColumnDef, RowSelectionState, SortingState } from '@tanstack/react-table'
import { useState } from 'react'
import { DataTable } from '@/components/shared/DataTable'
import { rowActionsColumn, selectionColumn } from '@/components/shared/data-table-columns'
import { EmptyState } from '@/components/shared/EmptyState'
import { renderWithProviders } from '@/test/render'

interface Row {
  id: string
  title: string
  department: string
  candidates: number
}

const rows: Row[] = [
  { id: 'jd1', title: 'Senior Python Developer', department: 'Engineering', candidates: 127 },
  { id: 'jd2', title: 'React Developer', department: 'Engineering', candidates: 64 },
  { id: 'jd3', title: 'HR Executive', department: 'Human Resources', candidates: 12 },
]

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'title', header: 'Title', enableSorting: true },
  { accessorKey: 'department', header: 'Department', enableSorting: false },
  {
    accessorKey: 'candidates',
    header: 'Candidates',
    enableSorting: true,
    meta: { align: 'right' },
  },
]

describe('DataTable', () => {
  it('renders headers and rows and marks the table with its label', () => {
    renderWithProviders(<DataTable columns={columns} data={rows} aria-label="Job descriptions" />)
    const table = screen.getByRole('table', { name: 'Job descriptions' })
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3)
    expect(within(table).getByText('Senior Python Developer')).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(4)
  })

  it('shows eight skeleton rows while loading', () => {
    renderWithProviders(<DataTable columns={columns} data={[]} loading />)
    const body = screen.getByLabelText('Loading rows')
    expect(body).toHaveAttribute('aria-busy', 'true')
    expect(within(body).getAllByRole('row')).toHaveLength(8)
  })

  it('renders the empty state slot when there is no data', () => {
    renderWithProviders(
      <DataTable
        columns={columns}
        data={[]}
        emptyState={<EmptyState title="No job descriptions yet" />}
      />,
    )
    expect(screen.getByRole('heading', { name: 'No job descriptions yet' })).toBeInTheDocument()
  })

  it('renders the toolbar slot above the table', () => {
    renderWithProviders(
      <DataTable columns={columns} data={rows} toolbar={<input aria-label="Search JDs" />} />,
    )
    expect(screen.getByRole('textbox', { name: 'Search JDs' })).toBeInTheDocument()
  })

  it('reports sorting changes through the callback and exposes aria-sort', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [sorting, setSorting] = useState<SortingState>([])
      return (
        <DataTable
          columns={columns}
          data={rows}
          sorting={{ state: sorting, onChange: setSorting }}
        />
      )
    }
    renderWithProviders(<Harness />)
    const header = screen.getByRole('columnheader', { name: /Title/ })
    expect(header).toHaveAttribute('aria-sort', 'none')
    await user.click(within(header).getByRole('button'))
    expect(header).toHaveAttribute('aria-sort', 'ascending')
    await user.click(within(header).getByRole('button'))
    expect(header).toHaveAttribute('aria-sort', 'descending')
    // Non-sortable headers get no button.
    expect(
      within(screen.getByRole('columnheader', { name: 'Department' })).queryByRole('button'),
    ).not.toBeInTheDocument()
  })

  it('shows the range and total and pages through the callback', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    renderWithProviders(
      <DataTable
        columns={columns}
        data={rows}
        total={127}
        pagination={{ pageIndex: 0, pageSize: 20, onChange }}
      />,
    )
    expect(screen.getByText('1–20 of 127')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onChange).toHaveBeenCalledWith({ pageIndex: 1, pageSize: 20 })
    await user.click(screen.getByRole('button', { name: 'Page 7' }))
    expect(onChange).toHaveBeenCalledWith({ pageIndex: 6, pageSize: 20 })
  })

  it('calls onRowClick on click and on Enter, but not from interactive children', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    const withLink: ColumnDef<Row>[] = [
      ...columns,
      { id: 'link', header: 'Link', cell: () => <button type="button">Inner</button> },
    ]
    renderWithProviders(<DataTable columns={withLink} data={rows} onRowClick={onRowClick} />)
    const row = screen.getByText('React Developer').closest('tr')!
    await user.click(within(row).getByText('React Developer'))
    expect(onRowClick).toHaveBeenLastCalledWith(rows[1])

    row.focus()
    await user.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenCalledTimes(2)

    await user.click(within(row).getByRole('button', { name: 'Inner' }))
    expect(onRowClick).toHaveBeenCalledTimes(2)
  })

  it('supports row selection with a bulk action bar', async () => {
    const user = userEvent.setup()
    function Harness() {
      const [selection, setSelection] = useState<RowSelectionState>({})
      return (
        <DataTable
          columns={[selectionColumn<Row>(), ...columns]}
          data={rows}
          getRowId={(row) => row.id}
          rowSelection={{ state: selection, onChange: setSelection }}
          bulkActions={({ selectedRows, clear }) => (
            <>
              <button type="button" onClick={() => clear()}>
                Shortlist {selectedRows.map((row) => row.id).join(',')}
              </button>
            </>
          )}
        />
      )
    }
    renderWithProviders(<Harness />)
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Select React Developer' }))
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shortlist jd2' })).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Select all rows' }))
    expect(screen.getByText('3 selected')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('renders a row actions menu that does not trigger the row click', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const withActions: ColumnDef<Row>[] = [
      ...columns,
      rowActionsColumn<Row>((row) => [
        { key: 'edit', label: 'Edit', onSelect: () => onEdit(row.id) },
        { key: 'delete', label: 'Delete', destructive: true, onSelect: () => onDelete(row.id) },
      ]),
    ]
    renderWithProviders(<DataTable columns={withActions} data={rows} onRowClick={onRowClick} />)

    await user.click(screen.getByRole('button', { name: 'Actions for row 1' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Delete' })).toHaveAttribute(
      'data-variant',
      'destructive',
    )
    await user.click(within(menu).getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledWith('jd1')
    expect(onRowClick).not.toHaveBeenCalled()
  })
})
