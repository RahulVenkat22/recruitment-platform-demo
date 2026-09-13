import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon, MailCheckIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { forgotPassword } from '@/lib/auth'

const schema = z.object({
  email: z.email({ error: 'Enter the email address you sign in with' }),
})
type Values = z.infer<typeof schema>

export const RESET_SENT_MESSAGE = 'If an account exists, a reset link has been sent.'

interface ForgotPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-filled from the login form when it looks like an email. */
  initialEmail?: string
}

/**
 * Posts to /auth/forgot-password/ and shows the same sentence whatever the server says.
 * The parent remounts it (via `key`) each time it opens, so the form starts clean.
 */
export function ForgotPasswordDialog({
  open,
  onOpenChange,
  initialEmail = '',
}: ForgotPasswordDialogProps) {
  const [sent, setSent] = useState(false)
  const emailId = useId()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit(values: Values) {
    try {
      await forgotPassword(values.email)
    } catch {
      // Deliberately silent: the response never reveals whether the account exists.
    }
    setSent(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>
            {sent
              ? 'Check your inbox for the next step.'
              : 'Enter your email and we will send you a link to choose a new password.'}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <>
            <div
              role="status"
              className="flex items-start gap-3 rounded-control bg-success-soft px-3 py-2.5 text-small text-success"
            >
              <MailCheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              <p>{RESET_SENT_MESSAGE}</p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor={emailId}>Email</FieldLabel>
              <Input
                id={emailId}
                type="email"
                autoComplete="email"
                autoFocus
                className="h-10"
                aria-invalid={Boolean(errors.email)}
                {...form.register('email')}
              />
              <FieldError errors={[errors.email]} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
                Send reset link
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
