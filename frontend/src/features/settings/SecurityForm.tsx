import { zodResolver } from '@hookform/resolvers/zod'
import { CircleAlertIcon, Loader2Icon } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { securitySchema, type SecurityValues } from '@/features/settings/settings-schemas'
import { fieldErrorMessage, getApiError } from '@/lib/api'
import { changePassword } from '@/lib/auth'

/** API field names that belong to the current-password input, whichever the serializer uses. */
const CURRENT_KEYS = ['current_password', 'old_password', 'password'] as const

export function SecurityForm() {
  const ids = { current: useId(), next: useId(), confirm: useId() }
  const [rootError, setRootError] = useState<string | null>(null)
  const form = useForm<SecurityValues>({
    resolver: zodResolver(securitySchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })
  const { errors, isSubmitting } = form.formState

  async function onSubmit(values: SecurityValues) {
    setRootError(null)
    try {
      await changePassword({
        current_password: values.current_password,
        new_password: values.new_password,
      })
      form.reset()
      toast.success('Password updated')
    } catch (error) {
      const parsed = getApiError(error)
      let mapped = false
      for (const key of CURRENT_KEYS) {
        const message = fieldErrorMessage(parsed.details, key)
        if (message) {
          form.setError('current_password', { type: 'server', message })
          mapped = true
          break
        }
      }
      const newMessage = fieldErrorMessage(parsed.details, 'new_password')
      if (newMessage) {
        form.setError('new_password', { type: 'server', message: newMessage })
        mapped = true
      }
      const nonField = fieldErrorMessage(parsed.details, 'non_field_errors')
      if (!mapped)
        setRootError(nonField ?? parsed.message ?? "Couldn't update your password. Try again.")
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="max-w-md space-y-5">
      {rootError && (
        <Alert variant="destructive" className="border-danger/20 bg-danger-soft text-danger">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription className="text-danger">{rootError}</AlertDescription>
        </Alert>
      )}

      <Field data-invalid={Boolean(errors.current_password)}>
        <FieldLabel htmlFor={ids.current}>Current password</FieldLabel>
        <Input
          id={ids.current}
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.current_password)}
          {...form.register('current_password')}
        />
        <FieldError errors={[errors.current_password]} />
      </Field>

      <Field data-invalid={Boolean(errors.new_password)}>
        <FieldLabel htmlFor={ids.next}>New password</FieldLabel>
        <Input
          id={ids.next}
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.new_password)}
          {...form.register('new_password')}
        />
        <FieldDescription>
          At least 8 characters, and not too similar to your name or email.
        </FieldDescription>
        <FieldError errors={[errors.new_password]} />
      </Field>

      <Field data-invalid={Boolean(errors.confirm_password)}>
        <FieldLabel htmlFor={ids.confirm}>Confirm new password</FieldLabel>
        <Input
          id={ids.confirm}
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.confirm_password)}
          {...form.register('confirm_password')}
        />
        <FieldError errors={[errors.confirm_password]} />
      </Field>

      <div className="border-t border-line pt-5">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          Update password
        </Button>
      </div>
    </form>
  )
}
