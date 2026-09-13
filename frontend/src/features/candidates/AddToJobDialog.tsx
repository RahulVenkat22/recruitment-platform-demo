import { Loader2Icon } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAddCandidateToJob } from '@/features/candidates/api'
import { useJobList } from '@/features/jobs/api'
import { describeError } from '@/lib/errors'
import type { CandidateDetail } from '@/types/domain'

export interface AddToJobDialogProps {
  candidate: CandidateDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded?: (jobId: string) => void
}

/** Attach a candidate to another open job description by hand (plan.md 6.10 POST /applications). */
export function AddToJobDialog({ candidate, open, onOpenChange, onAdded }: AddToJobDialogProps) {
  const id = useId()
  const jobs = useJobList({
    page_size: 100,
    status: ['open', 'on_hold', 'draft'],
    ordering: 'title',
  })
  const add = useAddCandidateToJob()
  const [jobId, setJobId] = useState('')
  const attached = useMemo(
    () => new Set(candidate.applications.map((row) => row.job_description)),
    [candidate],
  )
  const options = (jobs.data?.results ?? []).filter((row) => !attached.has(row.id))

  async function submit() {
    if (!jobId) return
    try {
      const application = await add.mutateAsync({ candidateId: candidate.id, jobId })
      toast.success(`Added ${candidate.full_name} to ${application.job.title}`)
      onAdded?.(jobId)
      onOpenChange(false)
      setJobId('')
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !add.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {candidate.full_name} to a job description</DialogTitle>
          <DialogDescription>
            They are scored against the role immediately and start as New.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>Job description</FieldLabel>
          <Select value={jobId} onValueChange={setJobId}>
            <SelectTrigger id={id} className="w-full">
              <SelectValue
                placeholder={
                  jobs.isPending
                    ? 'Loading…'
                    : options.length
                      ? 'Choose a job description'
                      : 'No other open roles'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {options.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.title}
                  <span className="text-ink-subtle"> · {row.department}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={add.isPending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!jobId || add.isPending}>
            {add.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Add to job description
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
