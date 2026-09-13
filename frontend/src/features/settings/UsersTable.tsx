import { useQuery } from '@tanstack/react-query'
import { UsersIcon } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonTableRows } from '@/components/shared/Skeletons'
import { UserChip } from '@/components/shared/UserChip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { api, endpoints } from '@/lib/api'
import { useEnumOptions } from '@/lib/enums'
import { qk } from '@/lib/query-keys'
import { personFromUser, type Paginated, type UserRow } from '@/types/domain'

const PAGE_SIZE = 100

async function fetchUsers(): Promise<UserRow[]> {
  const { data } = await api.get<Paginated<UserRow> | UserRow[]>(endpoints.users, {
    params: { page_size: PAGE_SIZE, ordering: 'first_name' },
  })
  return Array.isArray(data) ? data : data.results
}

/** Read-only directory for HR admins: name, designation, department, role and email. */
export function UsersTable() {
  const query = useQuery({ queryKey: qk.users.list({ page_size: PAGE_SIZE }), queryFn: fetchUsers })
  const roles = useEnumOptions('user_role')
  const roleLabel = (key: string) => roles.find((role) => role.key === key)?.label ?? key

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
    <div className="overflow-hidden rounded-card border border-line">
      {/* The Table wrapper scrolls horizontally; the min width keeps five columns readable. */}
      <Table className="min-w-[640px]">
        <TableHeader className="bg-surface-2">
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Designation</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Email</TableHead>
          </TableRow>
        </TableHeader>
        {query.isPending ? (
          <SkeletonTableRows rows={6} columns={5} />
        ) : (
          <TableBody>
            {query.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <UserChip user={personFromUser(row)} />
                </TableCell>
                <TableCell className="text-ink-muted">{row.designation}</TableCell>
                <TableCell className="text-ink-muted">{row.department}</TableCell>
                <TableCell>
                  <span className="inline-flex h-5 items-center rounded-pill bg-surface-2 px-2 text-caption text-ink-muted">
                    {roleLabel(row.role)}
                  </span>
                </TableCell>
                <TableCell className="text-ink-muted">{row.email}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        )}
      </Table>
      {query.isSuccess && query.data.length === 0 && (
        <EmptyState
          size="sm"
          icon={UsersIcon}
          title="No users yet"
          description="People appear here once they have an account."
        />
      )}
    </div>
  )
}
