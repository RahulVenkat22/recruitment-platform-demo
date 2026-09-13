import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useId } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { Avatar } from '@/components/shared/Avatar'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  profileSchema,
  timezoneOptions,
  type ProfileValues,
} from '@/features/settings/settings-schemas'
import { fieldErrorMessage, getApiError } from '@/lib/api'
import { updateProfile } from '@/lib/auth'
import type { SessionUser } from '@/types/domain'

const EDITABLE = ['first_name', 'last_name', 'phone', 'avatar_url', 'timezone'] as const

export function ProfileForm({ user }: { user: SessionUser }) {
  const ids = {
    first: useId(),
    last: useId(),
    designation: useId(),
    department: useId(),
    phone: useId(),
    avatar: useId(),
    timezone: useId(),
  }
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone ?? '',
      avatar_url: user.avatar_url ?? '',
      timezone: user.timezone,
    },
  })
  const { errors, isSubmitting, isDirty } = form.formState
  const [firstName, lastName, avatarUrl] = useWatch({
    control: form.control,
    name: ['first_name', 'last_name', 'avatar_url'],
  })
  const previewName = `${firstName} ${lastName}`.trim() || user.full_name
  const previewSrc = errors.avatar_url ? null : avatarUrl.trim() || null

  async function onSubmit(values: ProfileValues) {
    try {
      await updateProfile({
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone || null,
        avatar_url: values.avatar_url || null,
        timezone: values.timezone,
      })
      form.reset(values)
      toast.success('Profile saved')
    } catch (error) {
      const parsed = getApiError(error)
      let mapped = false
      for (const field of EDITABLE) {
        const message = fieldErrorMessage(parsed.details, field)
        if (message) {
          form.setError(field, { type: 'server', message })
          mapped = true
        }
      }
      if (!mapped) toast.error(parsed.message ?? "Couldn't save your profile. Try again.")
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="flex flex-wrap items-center gap-5">
        <Avatar name={previewName} src={previewSrc} size="2xl" />
        <div className="min-w-0 flex-1 basis-64">
          <Field data-invalid={Boolean(errors.avatar_url)}>
            <FieldLabel htmlFor={ids.avatar}>Avatar URL</FieldLabel>
            <Input
              id={ids.avatar}
              type="url"
              inputMode="url"
              placeholder="https://"
              autoComplete="photo"
              aria-invalid={Boolean(errors.avatar_url)}
              {...form.register('avatar_url')}
            />
            <FieldDescription>Leave empty to show your initials.</FieldDescription>
            <FieldError errors={[errors.avatar_url]} />
          </Field>
        </div>
      </div>

      <FieldGroup className="gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.first_name)}>
            <FieldLabel htmlFor={ids.first}>First name</FieldLabel>
            <Input
              id={ids.first}
              autoComplete="given-name"
              aria-invalid={Boolean(errors.first_name)}
              {...form.register('first_name')}
            />
            <FieldError errors={[errors.first_name]} />
          </Field>
          <Field data-invalid={Boolean(errors.last_name)}>
            <FieldLabel htmlFor={ids.last}>Last name</FieldLabel>
            <Input
              id={ids.last}
              autoComplete="family-name"
              aria-invalid={Boolean(errors.last_name)}
              {...form.register('last_name')}
            />
            <FieldError errors={[errors.last_name]} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={ids.designation}>Designation</FieldLabel>
            <Input
              id={ids.designation}
              readOnly
              value={user.designation}
              className="bg-surface-2 text-ink-muted"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.department}>Department</FieldLabel>
            <Input
              id={ids.department}
              readOnly
              value={user.department}
              className="bg-surface-2 text-ink-muted"
            />
          </Field>
        </div>
        <FieldDescription className="-mt-2">
          Designation and department are managed by your HR admin.
        </FieldDescription>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.phone)}>
            <FieldLabel htmlFor={ids.phone}>Phone</FieldLabel>
            <Input
              id={ids.phone}
              type="tel"
              autoComplete="tel"
              aria-invalid={Boolean(errors.phone)}
              {...form.register('phone')}
            />
            <FieldError errors={[errors.phone]} />
          </Field>
          <Field data-invalid={Boolean(errors.timezone)}>
            <FieldLabel htmlFor={ids.timezone}>Timezone</FieldLabel>
            <Controller
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger
                    id={ids.timezone}
                    className="w-full"
                    aria-invalid={Boolean(errors.timezone)}
                  >
                    <SelectValue placeholder="Choose a timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions(user.timezone).map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError errors={[errors.timezone]} />
          </Field>
        </div>
      </FieldGroup>

      <div className="flex items-center gap-3 border-t border-line pt-5">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          Save changes
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={!isDirty || isSubmitting}
          onClick={() => form.reset()}
        >
          Discard
        </Button>
      </div>
    </form>
  )
}
