import { useQuery } from '@tanstack/react-query'
import { api, endpoints } from '@/lib/api'
import { qk } from '@/lib/query-keys'
import { cn } from '@/lib/utils'

interface HealthResponse {
  status: string
}

/** Polls `GET /api/v1/health/`; the dot proves the dev proxy and the API are both up. */
export function HealthPill() {
  const { status } = useQuery({
    queryKey: qk.meta.health(),
    queryFn: async () => (await api.get<HealthResponse>(endpoints.health)).data,
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: false,
  })

  const view =
    status === 'pending'
      ? { label: 'Checking API', dot: 'bg-line-strong animate-pulse' }
      : status === 'error'
        ? { label: 'API offline', dot: 'bg-danger' }
        : { label: 'API online', dot: 'bg-success' }

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex h-7 items-center gap-2 rounded-pill border border-line bg-surface px-2.5 text-caption text-ink-muted tabular-nums"
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', view.dot)} />
      {view.label}
    </div>
  )
}
