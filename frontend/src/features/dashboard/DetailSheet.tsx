import {
  BriefcaseIcon,
  CalendarClockIcon,
  FileSignatureIcon,
  MessageSquareTextIcon,
  SearchIcon,
  SparklesIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { Avatar } from '@/components/shared/Avatar'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { SkeletonText } from '@/components/shared/Skeletons'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useDetails, type DashboardScope, type DetailQuery } from '@/features/dashboard/api'
import { formatCount } from '@/features/dashboard/dashboard-utils'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { DetailItem } from '@/types/domain'

/** A figure the reader opened, with the heading the drawer shows for it. */
export interface DetailRequest extends DetailQuery {
  title: string
  /** What the rows cover, e.g. "Last 30 days" or "Open roles in Data". */
  subtitle?: string
}

const KIND_ICONS: Record<DetailItem['kind'], LucideIcon> = {
  job: BriefcaseIcon,
  application: UserIcon,
  interview: CalendarClockIcon,
  offer: FileSignatureIcon,
  communication: MessageSquareTextIcon,
  search: SparklesIcon,
}

function matches(item: DetailItem, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [item.title, item.subtitle, item.status_label, item.value, item.note].some((text) =>
    text?.toLowerCase().includes(needle),
  )
}

function Row({ item }: { item: DetailItem }) {
  const Icon = KIND_ICONS[item.kind]
  return (
    <li data-slot="detail-row" className="flex gap-3 py-3">
      {item.person ? (
        <Avatar name={item.person.full_name} src={item.person.avatar_url} size="md" />
      ) : (
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-subtle">
          <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link to={item.href} className="font-medium text-ink hover:underline">
            {item.title}
          </Link>
          {item.status &&
            (item.status_kind ? (
              <StatusBadge status={item.status} kind={item.status_kind} dot />
            ) : (
              <span className="inline-flex h-5 items-center rounded-pill bg-surface-2 px-2 text-caption text-ink-muted">
                {item.status_label}
              </span>
            ))}
        </div>
        {item.subtitle && <p className="mt-0.5 text-caption text-ink-muted">{item.subtitle}</p>}
        {item.note && <p className="mt-0.5 text-caption text-ink-subtle">{item.note}</p>}
      </div>
      <div className="shrink-0 text-right">
        {item.value && <p className="text-small font-medium text-ink tabular-nums">{item.value}</p>}
        {item.at && (
          <p className="text-caption text-ink-subtle" title={formatDateTime(item.at)}>
            {item.at_label} {formatRelative(item.at)}
          </p>
        )}
      </div>
    </li>
  )
}

function Body({ request, scope }: { request: DetailRequest; scope: DashboardScope }) {
  const details = useDetails(scope, request)
  const [query, setQuery] = useState('')
  const items = details.data?.items ?? []
  const shown = items.filter((item) => matches(item, query))

  return (
    <>
      <SheetHeader className="border-b border-line pr-12">
        <SheetTitle className="text-h3 text-ink">{request.title}</SheetTitle>
        <SheetDescription className="text-small text-ink-muted">
          {details.data
            ? `${formatCount(details.data.count)} ${details.data.count === 1 ? 'row' : 'rows'}`
            : 'Loading…'}
          {request.subtitle ? ` · ${request.subtitle}` : ''}
          {details.data && details.data.count > items.length
            ? ` · showing the first ${items.length}`
            : ''}
        </SheetDescription>
        {items.length > 8 && (
          <div className="relative mt-2">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
            />
            <Input
              type="search"
              aria-label="Filter these rows"
              placeholder="Filter by name, role or status…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="bg-surface pl-8"
            />
          </div>
        )}
      </SheetHeader>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {details.isPending ? (
          <SkeletonText lines={8} className="pt-4" />
        ) : details.isError ? (
          <ErrorState
            variant="inline"
            title="Couldn't load these rows"
            error={details.error}
            onRetry={() => void details.refetch()}
          />
        ) : shown.length === 0 ? (
          <EmptyState
            size="sm"
            icon={SearchIcon}
            title={items.length === 0 ? 'Nothing here right now' : 'No rows match'}
            description={
              items.length === 0
                ? 'This figure has no records behind it in the chosen window.'
                : 'Try another word.'
            }
          />
        ) : (
          <ul className="divide-y divide-line" aria-label={request.title}>
            {shown.map((item) => (
              <Row key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

/**
 * The drawer every dashboard figure opens: the records behind the number,
 * listed in place with a filter box, each row linking to its full page. The
 * dashboard stays where it is; closing the drawer returns to it unchanged.
 */
export function DetailSheet({
  request,
  scope,
  onClose,
}: {
  request: DetailRequest | null
  scope: DashboardScope
  onClose: () => void
}) {
  // Keep the last request through the closing animation so the drawer does not blank.
  const [last, setLast] = useState(request)
  if (request && request !== last) setLast(request)
  const shown = request ?? last
  const key = shown
    ? [shown.metric, shown.key, shown.jobId, shown.statuses?.join(',')].join(':')
    : ''

  return (
    <Sheet open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        data-slot="detail-sheet"
        className="w-full gap-0 bg-surface p-0 text-ink data-[side=right]:sm:max-w-xl"
      >
        {shown && <Body key={key} request={shown} scope={scope} />}
      </SheetContent>
    </Sheet>
  )
}
