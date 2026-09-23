import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useQuery } from '@tanstack/react-query'
import { UsersIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { UserChip } from '@/components/shared/UserChip'
import { useEnumOptions } from '@/lib/enums'
import { qk } from '@/lib/query-keys'
import { fetchUsers } from '@/lib/users'
import { personFromUser, type UserRow } from '@/types/domain'

const PAGE_SIZE = 100

/** Read-only directory for HR admins: name, designation, department, role and email, sortable by each. */
export function UsersTable() {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'name', desc: false }])
  const [first] = sorting
  const ordering = first ? `${first.desc ? '-' : ''}${first.id}` : 'name'
  const query = useQuery({
    queryKey: qk.users.list({ page_size: PAGE_SIZE, ordering }),
    queryFn: () => fetchUsers({ page_size: PAGE_SIZE, ordering }),
  })
  const roles = useEnumOptions('user_role')

  const columns = useMemo<ColumnDef<UserRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        enableSorting: true,
        cell: ({ row }) => <UserChip user={personFromUser(row.original)} />,
      },
      {
        id: 'designation',
        header: 'Designation',
        enableSorting: true,
        cell: ({ row }) => <span className="text-ink-muted">{row.original.designation}</span>,
      },
      {
        id: 'department',
        header: 'Department',
        enableSorting: true,
        cell: ({ row }) => <span className="text-ink-muted">{row.original.department}</span>,
      },
      {
        id: 'role',
        header: 'Role',
        enableSorting: true,
        cell: ({ row }) => (
          <span className="inline-flex h-5 items-center rounded-pill bg-surface-2 px-2 text-caption text-ink-muted">
            {roles.find((role) => role.key === row.original.role)?.label ?? row.original.role}
          </span>
        ),
      },
      {
        id: 'email',
        header: 'Email',
        enableSorting: true,
        cell: ({ row }) => <span className="text-ink-muted">{row.original.email}</span>,
      },
    ],
    [roles],
  )

  if (query.isError) {
    return (
      <ErrorState
        variant="inline"
        title="Couldn't load users"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    )
  }

  return (
    <DataTable<UserRow>
      aria-label="Users"
      columns={columns}
      data={query.data ?? []}
      loading={query.isPending || query.isFetching}
      getRowId={(row) => row.id}
      sorting={{ state: sorting, onChange: setSorting }}
      skeletonRows={6}
      emptyState={
        <EmptyState
          size="sm"
          icon={UsersIcon}
          title="No users yet"
          description="People appear here once they have an account."
        />
      }
    />
  )
}
