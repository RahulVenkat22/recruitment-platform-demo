import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type { Paginated, UserRow } from '@/types/domain'

const DIRECTORY_PAGE_SIZE = 100

export interface UserListParams {
  search?: string
  role?: string
  department?: string
  page_size?: number
  ordering?: string
}

export async function fetchUsers(params: UserListParams = {}): Promise<UserRow[]> {
  const { data } = await api.get<Paginated<UserRow> | UserRow[]>(endpoints.users, {
    params: { page_size: DIRECTORY_PAGE_SIZE, ordering: 'first_name', ...params },
  })
  return Array.isArray(data) ? data : data.results
}

/** The whole active directory (a demo workspace has tens of people, not thousands). */
export function useUsersDirectory(enabled = true) {
  return useQuery({
    queryKey: qk.users.list({ page_size: DIRECTORY_PAGE_SIZE, directory: true }),
    queryFn: () => fetchUsers(),
    staleTime: 5 * 60_000,
    enabled,
  })
}
