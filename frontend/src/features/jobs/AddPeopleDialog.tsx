import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { describeError } from '@/lib/errors'
import { PeoplePicker, type PeoplePickerValue } from '@/components/shared/PeoplePicker'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAddParticipants } from '@/features/jobs/api'
import type { JobDetail } from '@/types/domain'

export interface AddPeopleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: JobDetail
  existingUserIds: readonly string[]
}

/** plan.md 9.6 People tab "+ Add people": the PeoplePicker in a dialog. */
export function AddPeopleDialog({
  open,
  onOpenChange,
  job,
  existingUserIds,
}: AddPeopleDialogProps) {
  const [value, setValue] = useState<PeoplePickerValue[]>([])
  const add = useAddParticipants(job.id)

  function close(next: boolean) {
    if (!next) setValue([])
    onOpenChange(next)
  }

  async function submit() {
    if (value.length === 0) return
    try {
      const added = await add.mutateAsync(value)
      toast.success(
        added.length === 1
          ? `Added ${added[0].user.full_name} as ${added[0].role_label}`
          : `Added ${added.length} people to the recruitment`,
      )
      close(false)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add people to the recruitment</DialogTitle>
          <DialogDescription>
            Pick colleagues and set their role. They will see “{job.title}” on their job list.
          </DialogDescription>
        </DialogHeader>
        <PeoplePicker value={value} onChange={setValue} excludeUserIds={existingUserIds} />
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => close(false)}
            disabled={add.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={value.length === 0 || add.isPending}
          >
            {add.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Add{' '}
            {value.length > 0
              ? `${value.length} ${value.length === 1 ? 'person' : 'people'}`
              : 'people'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
