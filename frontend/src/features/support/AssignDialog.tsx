import { Loader2Icon } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { UserSelect } from '@/components/shared/UserSelect'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { useAssignTicket } from '@/features/support/api'
import { describeError } from '@/lib/errors'
import { useUsersDirectory } from '@/lib/users'
import type { TicketDetail } from '@/types/domain'

const NOBODY = '__nobody__'

/** Hand the ticket to a colleague (support team only); they and the requester are told. */
export function AssignDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: TicketDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const id = useId()
  const directory = useUsersDirectory(open)
  const assign = useAssignTicket()
  const [value, setValue] = useState(NOBODY)

  useEffect(() => {
    if (!open) return
    const handle = window.setTimeout(() => setValue(ticket.assignee?.id ?? NOBODY), 0)
    return () => window.clearTimeout(handle)
  }, [open, ticket.assignee?.id])

  const people = (directory.data ?? []).filter((user) => user.is_active)
  const unchanged = value === (ticket.assignee?.id ?? NOBODY)

  async function save() {
    try {
      const saved = await assign.mutateAsync({
        id: ticket.id,
        assigneeId: value === NOBODY ? null : value,
      })
      toast.success(
        saved.assignee
          ? `${saved.number} assigned to ${saved.assignee.full_name}`
          : 'Assignee removed',
      )
      onOpenChange(false)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !assign.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign {ticket.number}</DialogTitle>
          <DialogDescription>
            The person you pick is notified, and so is the requester.
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>Assignee</FieldLabel>
          <UserSelect
            id={id}
            value={value}
            onChange={setValue}
            options={[
              {
                id: NOBODY,
                full_name: 'Nobody',
                first_name: 'Nobody',
                last_name: '',
                email: '',
                designation: 'Back to the queue',
                department: '',
                role: 'employee',
                avatar_url: null,
                initials: '–',
                is_active: true,
              },
              ...people,
            ]}
            placeholder={directory.isPending ? 'Loading people…' : 'Choose a person'}
          />
          <FieldDescription>
            Anyone can be assigned; HR admins see every ticket regardless.
          </FieldDescription>
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={assign.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={unchanged || assign.isPending}
          >
            {assign.isPending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
