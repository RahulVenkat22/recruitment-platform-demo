import type { ColumnDef } from '@tanstack/react-table'
import { LifeBuoyIcon, PlusIcon, SearchIcon, SearchXIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ClearFiltersButton } from '@/components/shared/ClearFiltersButton'
import { DataTable } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { FilterChips } from '@/components/shared/FilterChips'
import { FilterPopover } from '@/components/shared/FilterPopover'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SegmentedControl } from '@/components/shared/SegmentedControl'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { StaggerItem } from '@/components/shared/Stagger'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTicketSummary, useTickets } from '@/features/support/api'
import {
  PRIORITY_ORDER,
  STATUS_ORDER,
  TICKET_LIST_CLEARED,
  TICKET_LIST_SPEC,
  TICKET_SORT_OPTIONS,
  VIEW_OPTIONS,
  ticketHref,
} from '@/features/support/support-utils'
import { TicketFormDialog } from '@/features/support/TicketFormDialog'
import { enumMeta, useEnumOptions } from '@/lib/enums'
import { formatDateTime, formatRelative } from '@/lib/format'
import { useDebounce, useIsMobile, useUrlState } from '@/lib/hooks'
import { useUiStore, type PageSize } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import { personFromUser, type TicketRow, type TicketSummary } from '@/types/domain'

function Updated({ value }: { value: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-ink-muted whitespace-nowrap">{formatRelative(value)}</span>
      </TooltipTrigger>
      <TooltipContent>Last update {formatDateTime(value)}</TooltipContent>
    </Tooltip>
  )
}

function Assignee({ ticket }: { ticket: TicketRow }) {
  if (!ticket.assignee) return <span className="text-small text-ink-subtle">Unassigned</span>
  return <UserChip user={personFromUser(ticket.assignee)} />
}

/** Phone layout: one card per ticket with the same facts as the table row. */
function TicketCard({ ticket }: { ticket: TicketRow }) {
  const navigate = useNavigate()
  return (
    <article
      data-slot="ticket-card"
      onClick={() => void navigate(ticketHref(ticket.id))}
      className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-caption text-ink-subtle">{ticket.number}</span>
        <span className="flex items-center gap-1.5">
          <StatusBadge status={ticket.priority} kind="ticket_priority" />
          <StatusBadge status={ticket.status} kind="ticket_status" dot />
        </span>
      </div>
      <h3 className="text-[15px] leading-5 font-medium text-ink">{ticket.subject}</h3>
      <p className="text-caption text-ink-subtle">
        {ticket.category_label}
        {ticket.comment_count > 0 &&
          ` · ${ticket.comment_count} ${ticket.comment_count === 1 ? 'comment' : 'comments'}`}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-small">
        <UserChip user={personFromUser(ticket.requester)} />
        <Updated value={ticket.last_activity_at} />
      </div>
    </article>
  )
}

/**
 * Support: raise a ticket, follow its status, and look back over everything open,
 * in progress, resolved or closed. Admins (the support team) see every ticket;
 * everyone else sees the tickets they raised or were assigned.
 */
export default function SupportPage() {
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const pageSize = useUiStore((state) => state.pageSize)
  const setPageSize = useUiStore((state) => state.setPageSize)
  const [state, setState] = useUrlState(TICKET_LIST_SPEC)
  const [draft, setDraft] = useState(state.q)
  const debounced = useDebounce(draft, 300)
  const [creating, setCreating] = useState(false)
  const statuses = useEnumOptions('ticket_status')
  const priorities = useEnumOptions('ticket_priority')
  const categories = useEnumOptions('ticket_category')

  useEffect(() => {
    if (debounced !== state.q) setState({ q: debounced, page: 1 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  const scope = { mine: state.view === 'mine', assigned_to_me: state.view === 'assigned' }
  const list = useTickets({
    page: state.page,
    page_size: pageSize,
    search: state.q,
    status: state.status,
    priority: state.priority,
    category: state.category,
    ordering: state.sort,
    ...scope,
  })
  const summary = useTicketSummary(scope)
  const rows = list.data?.results ?? []
  const total = list.data?.count ?? 0
  const filtered =
    state.q !== '' ||
    state.status.length > 0 ||
    state.priority.length > 0 ||
    state.category.length > 0

  const statusChips = STATUS_ORDER.map((key) => {
    const meta = enumMeta('ticket_status', key)
    return {
      key,
      label: statuses.find((option) => option.key === key)?.label ?? meta.label,
      color: meta.fg,
      bg: meta.bg,
      count: summary.data?.[key as keyof TicketSummary],
    }
  })

  const columns = useMemo<ColumnDef<TicketRow, unknown>[]>(
    () => [
      {
        id: 'number',
        header: 'Ticket',
        enableSorting: true,
        sortDescFirst: true,
        meta: { className: 'w-28' },
        cell: ({ row }) => (
          <span className="font-mono text-caption text-ink-muted">{row.original.number}</span>
        ),
      },
      {
        id: 'subject',
        header: 'Subject',
        enableSorting: true,
        meta: { className: 'min-w-64' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block truncate font-medium text-ink">{row.original.subject}</span>
            <span className="block truncate text-caption text-ink-subtle">
              {row.original.category_label}
              {row.original.comment_count > 0 &&
                ` · ${row.original.comment_count} ${row.original.comment_count === 1 ? 'comment' : 'comments'}`}
            </span>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: false,
        cell: ({ row }) => <StatusBadge status={row.original.status} kind="ticket_status" dot />,
      },
      {
        id: 'priority',
        header: 'Priority',
        enableSorting: false,
        cell: ({ row }) => <StatusBadge status={row.original.priority} kind="ticket_priority" />,
      },
      {
        id: 'requester',
        header: 'Raised by',
        enableSorting: false,
        meta: { className: 'min-w-40' },
        cell: ({ row }) => <UserChip user={personFromUser(row.original.requester)} />,
      },
      {
        id: 'assignee',
        header: 'Assignee',
        enableSorting: false,
        meta: { className: 'min-w-40' },
        cell: ({ row }) => <Assignee ticket={row.original} />,
      },
      {
        id: 'last_activity_at',
        header: 'Updated',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => <Updated value={row.original.last_activity_at} />,
      },
    ],
    [],
  )

  const clearFilters = () => {
    setDraft('')
    setState(TICKET_LIST_CLEARED)
  }

  const emptyState: ReactNode = filtered ? (
    <EmptyState
      icon={SearchXIcon}
      title="No tickets match these filters"
      description="Try a different search, or clear the filters to see every ticket."
      action={
        <Button type="button" variant="outline" onClick={clearFilters}>
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={LifeBuoyIcon}
      title={state.view === 'assigned' ? 'Nothing on your desk' : 'No tickets yet'}
      description={
        state.view === 'assigned'
          ? 'Tickets assigned to you appear here.'
          : 'Stuck on something? Raise a ticket and the support team is notified straight away.'
      }
      action={
        state.view === 'assigned' ? undefined : (
          <Button type="button" onClick={() => setCreating(true)}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            New ticket
          </Button>
        )
      }
    />
  )

  const toolbar = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          aria-label="Status"
          options={statusChips}
          selected={state.status}
          onChange={(status) => setState({ status, page: 1 })}
        />
        <SegmentedControl
          size="sm"
          aria-label="Whose tickets"
          options={VIEW_OPTIONS}
          value={state.view}
          onChange={(view) => setState({ view, page: 1 })}
          className="ml-auto w-auto bg-surface"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            aria-label="Search tickets"
            placeholder="Search by number, subject or details…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="bg-surface pl-8"
          />
        </div>
        <FilterPopover
          label="Priority"
          options={PRIORITY_ORDER.map((key) => ({
            key,
            label: priorities.find((option) => option.key === key)?.label ?? key,
          }))}
          selected={state.priority}
          onChange={(priority) => setState({ priority, page: 1 })}
        />
        <FilterPopover
          label="Category"
          options={categories}
          selected={state.category}
          onChange={(category) => setState({ category, page: 1 })}
        />
        <div className="ml-auto flex items-center gap-2">
          <ClearFiltersButton active={filtered} onClick={clearFilters} />
          <Select value={state.sort} onValueChange={(sort) => setState({ sort, page: 1 })}>
            <SelectTrigger size="sm" aria-label="Sort" className="bg-surface">
              <span className="text-ink-subtle">Sort:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {TICKET_SORT_OPTIONS.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Support"
        subtitle="Raise a ticket for anything you need help with, follow its status, and look back over what was fixed."
        breadcrumbs={[{ label: 'Support' }]}
        actions={
          <Button type="button" onClick={() => setCreating(true)}>
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            New ticket
          </Button>
        }
      />
      <div className="space-y-4">
        {toolbar}
        {list.isError ? (
          <ErrorState
            title="Couldn't load tickets"
            error={list.error}
            onRetry={() => void list.refetch()}
          />
        ) : mobile ? (
          <>
            {list.isPending ? (
              <div aria-busy="true" aria-label="Loading tickets" className="space-y-3">
                {Array.from({ length: 4 }, (_, index) => (
                  <SkeletonCard key={index} lines={2} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-card border border-line bg-surface">{emptyState}</div>
            ) : (
              <div aria-busy={list.isFetching || undefined} className="space-y-3">
                {rows.map((ticket, index) => (
                  <StaggerItem key={ticket.id} index={index}>
                    <TicketCard ticket={ticket} />
                  </StaggerItem>
                ))}
              </div>
            )}
            {total > 0 && (
              <Pagination
                pageIndex={state.page - 1}
                pageSize={pageSize}
                total={total}
                onChange={({ pageIndex, pageSize: next }) => {
                  if (next !== pageSize) setPageSize(next as PageSize)
                  setState({ page: pageIndex + 1 })
                }}
              />
            )}
          </>
        ) : (
          <DataTable<TicketRow>
            aria-label="Support tickets"
            columns={columns}
            data={rows}
            loading={list.isPending || list.isFetching}
            getRowId={(row) => row.id}
            sorting={{
              state: state.sort
                ? [{ id: state.sort.replace(/^-/, ''), desc: state.sort.startsWith('-') }]
                : [],
              onChange: (sorting) => {
                const [first] = sorting
                setState({
                  sort: first ? `${first.desc ? '-' : ''}${first.id}` : '-last_activity_at',
                  page: 1,
                })
              },
            }}
            total={total}
            pagination={{
              pageIndex: state.page - 1,
              pageSize,
              onChange: ({ pageIndex, pageSize: next }) => {
                if (next !== pageSize) setPageSize(next as PageSize)
                setState({ page: pageIndex + 1 })
              },
            }}
            onRowClick={(ticket) => void navigate(ticketHref(ticket.id))}
            emptyState={emptyState}
            className={cn(list.isPending && 'min-h-40')}
          />
        )}
      </div>
      <TicketFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(ticket) => void navigate(ticketHref(ticket.id))}
      />
    </>
  )
}
