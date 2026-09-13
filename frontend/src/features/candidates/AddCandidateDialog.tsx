import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2Icon } from 'lucide-react'
import { useId } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'
import { SkillTagInput } from '@/components/shared/SkillTagInput'
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
import { Textarea } from '@/components/ui/textarea'
import { useCreateCandidate } from '@/features/candidates/api'
import { fieldErrorMessage, getApiError } from '@/lib/api'

const schema = z.object({
  full_name: z.string().trim().min(1, 'Enter the candidate’s name.').max(160),
  email: z.string().trim().email('Enter a valid email address.'),
  phone: z.string().trim().max(32),
  location: z.string().trim().max(160),
  current_title: z.string().trim().max(160),
  current_company: z.string().trim().max(160),
  total_experience_years: z.string().trim(),
  skills: z.array(z.string()),
  summary: z.string(),
  linkedin_url: z.string().trim(),
})
type Values = z.infer<typeof schema>

const FIELDS = [
  'full_name',
  'email',
  'phone',
  'location',
  'current_title',
  'current_company',
  'total_experience_years',
  'skills',
  'summary',
  'linkedin_url',
] as const

export interface AddCandidateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** plan.md 9.9 "+ Add candidate": manual entry, stored with source "Internal Database". */
export function AddCandidateDialog({ open, onOpenChange }: AddCandidateDialogProps) {
  const ids = {
    name: useId(),
    email: useId(),
    phone: useId(),
    location: useId(),
    title: useId(),
    company: useId(),
    years: useId(),
    skills: useId(),
    summary: useId(),
    linkedin: useId(),
  }
  const navigate = useNavigate()
  const create = useCreateCandidate()
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      email: '',
      phone: '',
      location: '',
      current_title: '',
      current_company: '',
      total_experience_years: '',
      skills: [],
      summary: '',
      linkedin_url: '',
    },
  })
  const { errors, isSubmitting } = form.formState

  async function submit(values: Values) {
    const years = Number(values.total_experience_years || 0)
    try {
      const candidate = await create.mutateAsync({
        full_name: values.full_name,
        email: values.email,
        phone: values.phone,
        location: values.location,
        current_title: values.current_title,
        current_company: values.current_company,
        total_experience_years: Number.isFinite(years) ? years : 0,
        skills: values.skills.map((name) => ({ name, proficiency: 3, is_primary: false })),
        summary: values.summary,
        linkedin_url: values.linkedin_url || null,
        headline: '',
        avatar_url: null,
        resume_url: null,
        github_url: null,
        notice_period_days: null,
        current_ctc: null,
        expected_ctc: null,
      })
      toast.success(`Added ${candidate.full_name}`)
      form.reset()
      onOpenChange(false)
      navigate(`/candidates/${candidate.id}`)
    } catch (error) {
      const parsed = getApiError(error)
      let mapped = false
      for (const field of FIELDS) {
        const message = fieldErrorMessage(parsed.details, field)
        if (message) {
          form.setError(field, { type: 'server', message })
          mapped = true
        }
      }
      if (!mapped) toast.error(parsed.message ?? "Couldn't add the candidate.")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add candidate</DialogTitle>
          <DialogDescription>
            Manual entry goes into the internal database; you can attach them to a job description
            afterwards.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={Boolean(errors.full_name)}>
              <FieldLabel htmlFor={ids.name}>Full name *</FieldLabel>
              <Input
                id={ids.name}
                autoComplete="off"
                aria-invalid={Boolean(errors.full_name)}
                {...form.register('full_name')}
              />
              <FieldError errors={[errors.full_name]} />
            </Field>
            <Field data-invalid={Boolean(errors.email)}>
              <FieldLabel htmlFor={ids.email}>Email *</FieldLabel>
              <Input
                id={ids.email}
                type="email"
                autoComplete="off"
                aria-invalid={Boolean(errors.email)}
                {...form.register('email')}
              />
              <FieldError errors={[errors.email]} />
            </Field>
            <Field data-invalid={Boolean(errors.phone)}>
              <FieldLabel htmlFor={ids.phone}>Phone</FieldLabel>
              <Input
                id={ids.phone}
                type="tel"
                placeholder="+91 98765 43210"
                {...form.register('phone')}
              />
              <FieldError errors={[errors.phone]} />
            </Field>
            <Field data-invalid={Boolean(errors.location)}>
              <FieldLabel htmlFor={ids.location}>Location</FieldLabel>
              <Input id={ids.location} placeholder="Chennai" {...form.register('location')} />
              <FieldError errors={[errors.location]} />
            </Field>
            <Field data-invalid={Boolean(errors.current_title)}>
              <FieldLabel htmlFor={ids.title}>Current title</FieldLabel>
              <Input
                id={ids.title}
                placeholder="Backend Engineer"
                {...form.register('current_title')}
              />
              <FieldError errors={[errors.current_title]} />
            </Field>
            <Field data-invalid={Boolean(errors.current_company)}>
              <FieldLabel htmlFor={ids.company}>Current company</FieldLabel>
              <Input id={ids.company} placeholder="Zoho" {...form.register('current_company')} />
              <FieldError errors={[errors.current_company]} />
            </Field>
            <Field data-invalid={Boolean(errors.total_experience_years)}>
              <FieldLabel htmlFor={ids.years}>Total experience (years)</FieldLabel>
              <Input
                id={ids.years}
                type="number"
                inputMode="decimal"
                min={0}
                max={60}
                step={0.5}
                {...form.register('total_experience_years')}
              />
              <FieldError errors={[errors.total_experience_years]} />
            </Field>
            <Field data-invalid={Boolean(errors.linkedin_url)}>
              <FieldLabel htmlFor={ids.linkedin}>LinkedIn URL</FieldLabel>
              <Input
                id={ids.linkedin}
                type="url"
                placeholder="https://linkedin.com/in/…"
                {...form.register('linkedin_url')}
              />
              <FieldError errors={[errors.linkedin_url]} />
            </Field>
          </div>
          <Field data-invalid={Boolean(errors.skills)}>
            <FieldLabel htmlFor={ids.skills}>Skills</FieldLabel>
            <Controller
              control={form.control}
              name="skills"
              render={({ field }) => (
                <SkillTagInput
                  id={ids.skills}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Python, Django…"
                />
              )}
            />
            <FieldError errors={[errors.skills]} />
          </Field>
          <Field data-invalid={Boolean(errors.summary)}>
            <FieldLabel htmlFor={ids.summary}>Summary</FieldLabel>
            <Textarea
              id={ids.summary}
              rows={3}
              placeholder="A short professional summary."
              {...form.register('summary')}
            />
            <FieldError errors={[errors.summary]} />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              Add candidate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
