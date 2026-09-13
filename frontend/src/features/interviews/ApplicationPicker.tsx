import { SearchIcon } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/shared/Avatar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useApplications } from '@/features/applications/api'
import { toTarget, type PipelineTarget } from '@/features/applications/pipeline-target'
import { useDebounce } from '@/lib/hooks'

export interface ApplicationPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (target: PipelineTarget) => void
}

/** "Schedule interview" from the Interviews page: pick which candidate on which JD first. */
export function ApplicationPicker({ open, onOpenChange, onPick }: ApplicationPickerProps) {
  const [query, setQuery] = useState('')
  const debounced = useDebounce(query, 250)
  const list = useApplications(
    {
      search: debounced,
      status_group: 'shortlisted,in_progress,interview',
      ordering: '-last_activity_at',
      page_size: 12,
    },
    open,
  )
  const rows = list.data?.results ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Who is the interview for?</DialogTitle>
          <DialogDescription>Candidates in review, contact or interview stages.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            aria-label="Search candidates"
            placeholder="Search by name, company or skill…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-8"
            autoFocus
          />
        </div>
        <ul
          className="max-h-80 divide-y divide-line overflow-y-auto rounded-control border border-line"
          aria-label="Candidates"
        >
          {list.isPending ? (
            <li className="px-3 py-6 text-center text-small text-ink-subtle">Loading…</li>
          ) : rows.length === 0 ? (
            <li className="px-3 py-6 text-center text-small text-ink-subtle">
              No candidates match.
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onPick(toTarget(row))}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2"
                >
                  <Avatar name={row.candidate.full_name} src={row.candidate.avatar_url} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-small font-medium text-ink">
                      {row.candidate.full_name}
                    </span>
                    <span className="block truncate text-caption text-ink-subtle">
                      {row.job.title}
                    </span>
                  </span>
                  <StatusBadge status={row.status} size="sm" />
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
