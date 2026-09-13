import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toQuery } from '@/features/applications/api'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import type { Notification, Paginated, UnreadCount } from '@/types/domain'

/** plan.md 6.8: the bell polls the unread count every 60 seconds. */
export const UNREAD_POLL_MS = 60_000

export interface NotificationListParams {
  page?: number
  page_size?: number
  unread?: boolean
  type?: string[]
}

export async function fetchNotifications(
  params: NotificationListParams,
): Promise<Paginated<Notification>> {
  const { data } = await api.get<Paginated<Notification>>(endpoints.notifications, {
    params: toQuery(params),
  })
  return data
}

export async function fetchUnreadCount(): Promise<UnreadCount> {
  const { data } = await api.get<UnreadCount>(endpoints.notificationsUnreadCount)
  return data
}

export async function markRead(id: string): Promise<Notification> {
  const { data } = await api.post<Notification>(endpoints.notificationRead(id))
  return data
}

export async function markAllRead(): Promise<{ marked: number }> {
  const { data } = await api.post<{ marked: number }>(endpoints.notificationsReadAll)
  return data
}

export function useNotifications(params: NotificationListParams, enabled = true) {
  return useQuery({
    queryKey: qk.notifications.list(toQuery(params)),
    queryFn: () => fetchNotifications(params),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: qk.notifications.unreadCount(),
    queryFn: fetchUnreadCount,
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: UNREAD_POLL_MS / 2,
    enabled,
  })
}

function useInvalidateNotifications() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: qk.notifications.all })
}

export function useMarkRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({ mutationFn: (id: string) => markRead(id), onSuccess: invalidate })
}

export function useMarkAllRead() {
  const invalidate = useInvalidateNotifications()
  return useMutation({ mutationFn: markAllRead, onSuccess: invalidate })
}
