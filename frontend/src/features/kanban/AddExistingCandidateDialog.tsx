import { Loader2Icon, SearchIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAddCandidateToJob, useCandidates } from '@/features/candidates/api'
import { describeError } from '@/lib/errors'
import { useDebounce } from '@/lib/hooks'
import type { JobDetail } from '@/types/domain'

export interface AddExistingCandidateDialogProps {
  job: JobDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** The column "+" (plan.md 9.7): attach a candidate from the database to this JD; they land in New. */
export function AddExistingCandidateDialog({
  job,
  open,
  onOpenChange,
}: AddExistingCandidateDialogProps) {
  const [query, setQuery] = useState('')
  const debounced = useDebounce(query, 250)
  const list = useCandidates({ search: debounced, page_size: 12, ordering: '-last_activity' })
  const add = useAddCandidateToJob()
  const [busy, setBusy] = useState<string | null>(null)
  const rows = useMemo(
    () =>
      (list.data?.results ?? []).filter(
        (row) => !row.applications.some((application) => application.job_description === job.id),
      ),
    [list.data, job.id],
  )

  async function pick(candidateId: string, name: string) {
    setBusy(candidateId)
    try {
      await add.mutateAsync({ candidateId, jobId: job.id })
      toast.success(`Added ${name} to ${job.title}`)
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a candidate to {job.title}</DialogTitle>
          <DialogDescription>
            Anyone already in the database; they are scored against the role and start in New.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle"
          />
          <Input
            type="search"
            aria-label="Search candidates"
            placeholder="Name, company or skill…"
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
              No unattached candidates match.
            </li>
          ) : (
            rows.map((row) => (
              <li key={row.id} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={row.full_name} src={row.avatar_url} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium text-ink">
                    {row.full_name}
                  </span>
                  <span className="block truncate text-caption text-ink-subtle">
                    {row.headline}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void pick(row.id, row.full_name)}
                >
                  {busy === row.id && <Loader2Icon aria-hidden="true" className="animate-spin" />}
                  Add
                </Button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
