import { BriefcaseIcon, PlusIcon, UserRoundIcon, UserSearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { Avatar } from '@/components/shared/Avatar'
import { StatusBadge } from '@/components/shared/StatusBadge'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command'
import { useCandidates } from '@/features/candidates/api'
import { candidateRowHref } from '@/features/candidates/candidate-utils'
import { useJobList } from '@/features/jobs/api'
import { useAuthStore } from '@/lib/auth-store'
import { useDebounce } from '@/lib/hooks'

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** plan.md 9.2: ⌘K command dialog with job descriptions, candidates and quick actions. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate()
  const role = useAuthStore((state) => state.user?.role)
  const [query, setQuery] = useState('')
  const debounced = useDebounce(query, 200)
  const jobs = useJobList({ search: debounced, page_size: 6, ordering: '-updated_at' })
  const candidates = useCandidates({ search: debounced, page_size: 6, ordering: '-last_activity' })
  const hr = role === 'hr' || role === 'hr_admin'

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => setQuery(''), 0)
    return () => window.clearTimeout(handle)
  }, [open])

  function go(to: string) {
    onOpenChange(false)
    navigate(to)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Job descriptions, candidates and quick actions"
      className="sm:max-w-xl"
    >
      <Command shouldFilter={false} label="Global search">
        <CommandInput
          placeholder="Search job descriptions and candidates…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>
            {jobs.isPending || candidates.isPending ? 'Searching…' : 'Nothing matches.'}
          </CommandEmpty>
          {(jobs.data?.results.length ?? 0) > 0 && (
            <CommandGroup heading={debounced ? 'Job descriptions' : 'Recent job descriptions'}>
              {jobs.data?.results.map((job) => (
                <CommandItem
                  key={job.id}
                  value={`job-${job.id}`}
                  onSelect={() => go(`/jobs/${job.id}`)}
                >
                  <BriefcaseIcon aria-hidden="true" className="text-ink-subtle" />
                  <span className="min-w-0 flex-1 truncate">{job.title}</span>
                  <StatusBadge status={job.status} kind="jd_status" size="sm" />
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(candidates.data?.results.length ?? 0) > 0 && (
            <CommandGroup heading={debounced ? 'Candidates' : 'Recently active candidates'}>
              {candidates.data?.results.map((row) => (
                <CommandItem
                  key={row.id}
                  value={`candidate-${row.id}`}
                  onSelect={() => go(candidateRowHref(row))}
                >
                  <Avatar name={row.full_name} src={row.avatar_url} size="xs" />
                  <span className="min-w-0 flex-1 truncate">{row.full_name}</span>
                  <span className="truncate text-caption text-ink-subtle">{row.headline}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          <CommandGroup heading="Quick actions">
            {hr && (
              <CommandItem value="action-new-jd" onSelect={() => go('/jobs/new')}>
                <PlusIcon aria-hidden="true" className="text-ink-subtle" />
                Create Job Description
              </CommandItem>
            )}
            <CommandItem value="action-search" onSelect={() => go('/search')}>
              <UserSearchIcon aria-hidden="true" className="text-ink-subtle" />
              Search Candidates
            </CommandItem>
            <CommandItem value="action-candidates" onSelect={() => go('/candidates')}>
              <UserRoundIcon aria-hidden="true" className="text-ink-subtle" />
              All candidates
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
