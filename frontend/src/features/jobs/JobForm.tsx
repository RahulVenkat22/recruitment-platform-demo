import { zodResolver } from '@hookform/resolvers/zod'
import { EyeIcon, Loader2Icon, RotateCcwIcon, XIcon } from 'lucide-react'
import { useEffect, useId, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { PeoplePicker } from '@/components/shared/PeoplePicker'
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useJobFacets } from '@/features/jobs/api'
import { FormRail } from '@/features/jobs/FormRail'
import {
  completionOf,
  CURRENCIES,
  DOMAIN_SUGGESTIONS,
  EMPLOYMENT_TYPES,
  FORM_SECTIONS,
  jobFormSchema,
  parseWhole,
  SERVER_FIELDS,
  WORK_MODES,
  type FormSectionId,
  type JobFormValues,
} from '@/features/jobs/job-form-schema'
import { employmentTypeLabel, formatSalaryRange, workModeLabel } from '@/features/jobs/job-utils'
import { JobPreviewSheet } from '@/features/jobs/JobPreviewSheet'
import { useDraftAutosave } from '@/features/jobs/useDraftAutosave'
import { fieldErrorMessage, getApiError } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { useUsersDirectory } from '@/lib/users'
import type { Crumb } from '@/lib/ui-store'
import { cn } from '@/lib/utils'
import type { JobDetail, Person } from '@/types/domain'

export type SubmitIntent = 'draft' | 'open' | 'save'

export interface JobFormProps {
  mode: 'create' | 'edit'
  /** The JD being edited; absent in create mode. */
  job?: JobDetail
  initialValues: JobFormValues
  /** The creator, pinned as Owner in the people picker and shown in the preview. */
  creator: Person | null
  breadcrumbs: Crumb[]
  title: string
  /** Where Cancel goes. */
  cancelTo: string
  onSubmit: (values: JobFormValues, intent: SubmitIntent, changeSummary: string) => Promise<void>
}

const SECTION_CLASS =
  'scroll-mt-28 rounded-card border border-line bg-surface p-5 shadow-card md:p-6'

/**
 * Scrolls only the content area (`#main`) so a rail jump never moves the page
 * shell or any other ancestor (Enhancement.md 4, issue 2). Honours the section's
 * scroll margin, the sticky page header, and the reduced-motion preference.
 */
function scrollSectionIntoView(section: HTMLElement | null) {
  if (!section) return
  const container = section.closest<HTMLElement>('#main') ?? section.parentElement
  if (!container) return
  const margin = parseFloat(getComputedStyle(section).scrollMarginTop || '0') || 0
  const top =
    section.getBoundingClientRect().top -
    container.getBoundingClientRect().top +
    container.scrollTop
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  container.scrollTo({ top: Math.max(0, top - margin), behavior: reduced ? 'auto' : 'smooth' })
}
const HEADING_CLASS = 'text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase'

/** The create / edit form of plan.md 9.5: rail, five sections, preview, autosave, unsaved guard. */
export function JobForm({
  mode,
  job,
  initialValues,
  creator,
  breadcrumbs,
  title,
  cancelTo,
  onSubmit,
}: JobFormProps) {
  const navigate = useNavigate()
  const ids = {
    title: useId(),
    department: useId(),
    location: useId(),
    workMode: useId(),
    type: useId(),
    expMin: useId(),
    expMax: useId(),
    openings: useId(),
    domain: useId(),
    salaryMin: useId(),
    salaryMax: useId(),
    currency: useId(),
    required: useId(),
    preferred: useId(),
    education: useId(),
    responsibilities: useId(),
    qualifications: useId(),
    additional: useId(),
    description: useId(),
    people: useId(),
    departments: useId(),
    locations: useId(),
    domains: useId(),
    summary: useId(),
  }
  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: initialValues,
    mode: 'onTouched',
  })
  const { errors, isSubmitting, isDirty } = form.formState
  const values = useWatch({ control: form.control })
  const facets = useJobFacets()
  const directory = useUsersDirectory()
  const draft = useDraftAutosave(job?.id ?? 'new', form)
  const [active, setActive] = useState<FormSectionId>('basics')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [changeSummary, setChangeSummary] = useState('')
  const [pendingValues, setPendingValues] = useState<JobFormValues | null>(null)

  const completion = useMemo(
    () => completionOf({ ...initialValues, ...(values as Partial<JobFormValues>) }, creator?.id),
    [values, initialValues, creator?.id],
  )

  const departments = useMemo(() => {
    const names = new Set<string>()
    facets.data?.departments.forEach((option) => names.add(option.key))
    directory.data?.forEach((user) => names.add(user.department))
    return [...names].sort()
  }, [facets.data, directory.data])
  const locations = useMemo(
    () => (facets.data?.locations ?? []).map((option) => option.key),
    [facets.data],
  )

  // plan.md 9.5: prompt before the page is left with unsaved changes.
  useEffect(() => {
    if (!isDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  function jump(id: FormSectionId) {
    setActive(id)
    scrollSectionIntoView(document.getElementById(`section-${id}`))
  }

  /** Saves through the page callback; reports failures and returns whether it worked. */
  async function submit(
    formValues: JobFormValues,
    intent: SubmitIntent,
    summary: string,
  ): Promise<boolean> {
    try {
      await onSubmit(formValues, intent, summary)
      draft.clear()
      form.reset(formValues)
      return true
    } catch (error) {
      const parsed = getApiError(error)
      let mapped = false
      for (const field of SERVER_FIELDS) {
        const message = fieldErrorMessage(parsed.details, field)
        if (message) {
          form.setError(field, { type: 'server', message })
          mapped = true
        }
      }
      const nonField = fieldErrorMessage(parsed.details, 'non_field_errors')
      if (mapped) {
        toast.error('Some fields need attention.')
      } else {
        toast.error(nonField ?? parsed.message ?? "Couldn't save the job description. Try again.")
      }
      return false
    }
  }

  async function handleValid(formValues: JobFormValues, intent: SubmitIntent) {
    if (mode === 'edit') {
      setPendingValues(formValues)
      setSummaryOpen(true)
      return
    }
    await submit(formValues, intent, '')
  }

  /** Validate, then save with the given intent (draft / open / save). */
  function trigger(intent: SubmitIntent) {
    void form.handleSubmit((formValues) => handleValid(formValues, intent))()
  }

  async function confirmSummary() {
    if (!pendingValues) return
    setSummaryOpen(false)
    await submit(pendingValues, 'save', changeSummary)
  }

  function cancel() {
    if (isDirty) setDiscardOpen(true)
    else navigate(cancelTo)
  }

  const salaryPreview = formatSalaryRange(
    parseWhole(values.salary_min ?? '') ?? null,
    parseWhole(values.salary_max ?? '') ?? null,
    (values.salary_currency || 'INR').toUpperCase(),
    { compact: false },
  )

  const actions = (
    <>
      <Button type="button" variant="ghost" onClick={cancel} disabled={isSubmitting}>
        Cancel
      </Button>
      {mode === 'create' && (
        <Button
          type="button"
          variant="outline"
          onClick={() => trigger('draft')}
          disabled={isSubmitting}
        >
          Save as Draft
        </Button>
      )}
      <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
        <EyeIcon data-icon="inline-start" aria-hidden="true" />
        Preview
      </Button>
      <Button
        type="button"
        onClick={() => trigger(mode === 'edit' ? 'save' : 'open')}
        disabled={isSubmitting}
      >
        {isSubmitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {mode === 'edit' ? 'Save changes' : 'Create Job Description'}
      </Button>
    </>
  )

  return (
    <>
      <PageHeader
        title={title}
        breadcrumbs={breadcrumbs}
        actions={<div className="flex flex-wrap items-center gap-2 max-md:hidden">{actions}</div>}
      />

      {draft.savedDraft && (
        <div
          role="status"
          className="mb-5 flex flex-wrap items-center gap-3 rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-small text-ink"
        >
          <span className="flex-1">
            You have an unsaved draft from {formatRelative(draft.savedDraft.savedAt)}.
          </span>
          <Button type="button" size="sm" variant="outline" onClick={draft.restore}>
            <RotateCcwIcon data-icon="inline-start" aria-hidden="true" />
            Restore draft
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={draft.discard}>
            <XIcon data-icon="inline-start" aria-hidden="true" />
            Discard
          </Button>
        </div>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          trigger(mode === 'edit' ? 'save' : 'open')
        }}
        className="grid gap-6 pb-24 md:pb-0 lg:grid-cols-[220px_minmax(0,880px)] lg:items-start"
      >
        <FormRail
          sections={FORM_SECTIONS}
          complete={completion.sections}
          active={active}
          percent={completion.percent}
          onSelect={jump}
          className="lg:sticky lg:top-24"
        />

        <div className="space-y-5">
          {/* ------------------------------------------------------------ Basics */}
          <section
            id="section-basics"
            aria-labelledby="heading-basics"
            onFocusCapture={() => setActive('basics')}
            className={SECTION_CLASS}
          >
            <h2 id="heading-basics" className={HEADING_CLASS}>
              Basics
            </h2>
            <FieldGroup className="mt-4 gap-4">
              <Field data-invalid={Boolean(errors.title)}>
                <FieldLabel htmlFor={ids.title}>Job title *</FieldLabel>
                <Input
                  id={ids.title}
                  placeholder="Senior Python Developer"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.title)}
                  {...form.register('title')}
                />
                <FieldError errors={[errors.title]} />
              </Field>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field data-invalid={Boolean(errors.department)}>
                  <FieldLabel htmlFor={ids.department}>Department *</FieldLabel>
                  <Input
                    id={ids.department}
                    list={ids.departments}
                    placeholder="Engineering"
                    autoComplete="off"
                    aria-invalid={Boolean(errors.department)}
                    {...form.register('department')}
                  />
                  <datalist id={ids.departments}>
                    {departments.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <FieldError errors={[errors.department]} />
                </Field>
                <Field data-invalid={Boolean(errors.location)}>
                  <FieldLabel htmlFor={ids.location}>Location *</FieldLabel>
                  <Input
                    id={ids.location}
                    list={ids.locations}
                    placeholder="Chennai"
                    autoComplete="off"
                    aria-invalid={Boolean(errors.location)}
                    {...form.register('location')}
                  />
                  <datalist id={ids.locations}>
                    {locations.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                  <FieldError errors={[errors.location]} />
                </Field>
                <Field data-invalid={Boolean(errors.work_mode)}>
                  <FieldLabel htmlFor={ids.workMode}>Work mode</FieldLabel>
                  <Controller
                    control={form.control}
                    name="work_mode"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id={ids.workMode} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WORK_MODES.map((key) => (
                            <SelectItem key={key} value={key}>
                              {workModeLabel(key)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.work_mode]} />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-start">
                <Field data-invalid={Boolean(errors.employment_type)}>
                  <FieldLabel htmlFor={ids.type}>Employment type *</FieldLabel>
                  <Controller
                    control={form.control}
                    name="employment_type"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id={ids.type} className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {EMPLOYMENT_TYPES.map((key) => (
                            <SelectItem key={key} value={key}>
                              {employmentTypeLabel(key)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldError errors={[errors.employment_type]} />
                </Field>
                <Field data-invalid={Boolean(errors.experience_min_years)} className="sm:w-28">
                  <FieldLabel htmlFor={ids.expMin}>Experience min *</FieldLabel>
                  <Input
                    id={ids.expMin}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    placeholder="4"
                    aria-invalid={Boolean(errors.experience_min_years)}
                    {...form.register('experience_min_years')}
                  />
                  <FieldError errors={[errors.experience_min_years]} />
                </Field>
                <Field data-invalid={Boolean(errors.experience_max_years)} className="sm:w-28">
                  <FieldLabel htmlFor={ids.expMax}>Experience max *</FieldLabel>
                  <Input
                    id={ids.expMax}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={50}
                    placeholder="8"
                    aria-invalid={Boolean(errors.experience_max_years)}
                    {...form.register('experience_max_years')}
                  />
                  <FieldError errors={[errors.experience_max_years]} />
                </Field>
                <Field data-invalid={Boolean(errors.openings)} className="sm:w-24">
                  <FieldLabel htmlFor={ids.openings}>Openings</FieldLabel>
                  <Input
                    id={ids.openings}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={500}
                    aria-invalid={Boolean(errors.openings)}
                    {...form.register('openings')}
                  />
                  <FieldError errors={[errors.openings]} />
                </Field>
              </div>

              <Field data-invalid={Boolean(errors.domain)} className="sm:max-w-xs">
                <FieldLabel htmlFor={ids.domain}>Domain</FieldLabel>
                <Input
                  id={ids.domain}
                  list={ids.domains}
                  placeholder="fintech"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.domain)}
                  {...form.register('domain')}
                />
                <datalist id={ids.domains}>
                  {DOMAIN_SUGGESTIONS.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <FieldDescription>
                  Used by the AI match to score a candidate's industry background.
                </FieldDescription>
                <FieldError errors={[errors.domain]} />
              </Field>
            </FieldGroup>
          </section>

          {/* ------------------------------------------------------ Compensation */}
          <section
            id="section-compensation"
            aria-labelledby="heading-compensation"
            onFocusCapture={() => setActive('compensation')}
            className={SECTION_CLASS}
          >
            <h2 id="heading-compensation" className={HEADING_CLASS}>
              Compensation
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
              <Field data-invalid={Boolean(errors.salary_min)}>
                <FieldLabel htmlFor={ids.salaryMin}>Salary from (per year)</FieldLabel>
                <Input
                  id={ids.salaryMin}
                  inputMode="numeric"
                  placeholder="18,00,000"
                  aria-invalid={Boolean(errors.salary_min)}
                  {...form.register('salary_min')}
                />
                <FieldError errors={[errors.salary_min]} />
              </Field>
              <Field data-invalid={Boolean(errors.salary_max)}>
                <FieldLabel htmlFor={ids.salaryMax}>Salary to (per year)</FieldLabel>
                <Input
                  id={ids.salaryMax}
                  inputMode="numeric"
                  placeholder="28,00,000"
                  aria-invalid={Boolean(errors.salary_max)}
                  {...form.register('salary_max')}
                />
                <FieldError errors={[errors.salary_max]} />
              </Field>
              <Field data-invalid={Boolean(errors.salary_currency)} className="sm:w-28">
                <FieldLabel htmlFor={ids.currency}>Currency</FieldLabel>
                <Controller
                  control={form.control}
                  name="salary_currency"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id={ids.currency} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.salary_currency]} />
              </Field>
            </div>
            <p className="mt-3 text-small text-ink-muted">
              {salaryPreview ? (
                <>
                  Shown to the team as <span className="font-medium text-ink">{salaryPreview}</span>{' '}
                  per year.
                </>
              ) : (
                'Leave both empty if the range is not decided yet.'
              )}
            </p>
          </section>

          {/* ------------------------------------------------------------ Skills */}
          <section
            id="section-skills"
            aria-labelledby="heading-skills"
            onFocusCapture={() => setActive('skills')}
            className={SECTION_CLASS}
          >
            <h2 id="heading-skills" className={HEADING_CLASS}>
              Skills
            </h2>
            <FieldGroup className="mt-4 gap-4">
              <Field data-invalid={Boolean(errors.required_skills)}>
                <FieldLabel htmlFor={ids.required}>Required skills *</FieldLabel>
                <Controller
                  control={form.control}
                  name="required_skills"
                  render={({ field }) => (
                    <SkillTagInput
                      id={ids.required}
                      value={field.value}
                      onChange={field.onChange}
                      exclude={values.preferred_skills ?? []}
                      placeholder="Python, Django, PostgreSQL…"
                      aria-invalid={Boolean(errors.required_skills)}
                    />
                  )}
                />
                <FieldDescription>
                  Press Enter after each skill. Spelling is normalised on save, so “Postgres” and
                  “PostgreSQL” match the same candidates.
                </FieldDescription>
                <FieldError errors={[errors.required_skills]} />
              </Field>
              <Field data-invalid={Boolean(errors.preferred_skills)}>
                <FieldLabel htmlFor={ids.preferred}>Preferred skills</FieldLabel>
                <Controller
                  control={form.control}
                  name="preferred_skills"
                  render={({ field }) => (
                    <SkillTagInput
                      id={ids.preferred}
                      value={field.value}
                      onChange={field.onChange}
                      exclude={values.required_skills ?? []}
                      placeholder="FastAPI, AWS…"
                    />
                  )}
                />
                <FieldError errors={[errors.preferred_skills]} />
              </Field>
              <Field data-invalid={Boolean(errors.education_requirements)}>
                <FieldLabel htmlFor={ids.education}>Educational requirements</FieldLabel>
                <Textarea
                  id={ids.education}
                  rows={2}
                  placeholder="B.Tech / B.E in Computer Science or related"
                  {...form.register('education_requirements')}
                />
                <FieldError errors={[errors.education_requirements]} />
              </Field>
            </FieldGroup>
          </section>

          {/* ----------------------------------------------------------- Details */}
          <section
            id="section-details"
            aria-labelledby="heading-details"
            onFocusCapture={() => setActive('details')}
            className={SECTION_CLASS}
          >
            <h2 id="heading-details" className={HEADING_CLASS}>
              Details
            </h2>
            <FieldGroup className="mt-4 gap-4">
              <Field data-invalid={Boolean(errors.responsibilities)}>
                <FieldLabel htmlFor={ids.responsibilities}>
                  Job responsibilities{' '}
                  <span className="font-normal text-ink-subtle">(one per line)</span>
                </FieldLabel>
                <Textarea
                  id={ids.responsibilities}
                  rows={4}
                  placeholder={'Design and ship backend services\nReview code and mentor engineers'}
                  {...form.register('responsibilities')}
                />
                <FieldError errors={[errors.responsibilities]} />
              </Field>
              <Field data-invalid={Boolean(errors.qualifications)}>
                <FieldLabel htmlFor={ids.qualifications}>
                  Required qualifications{' '}
                  <span className="font-normal text-ink-subtle">(one per line)</span>
                </FieldLabel>
                <Textarea
                  id={ids.qualifications}
                  rows={3}
                  placeholder={'4+ years with Python in production\nHands-on with PostgreSQL'}
                  {...form.register('qualifications')}
                />
                <FieldError errors={[errors.qualifications]} />
              </Field>
              <Field data-invalid={Boolean(errors.additional_requirements)}>
                <FieldLabel htmlFor={ids.additional}>Additional requirements</FieldLabel>
                <Textarea
                  id={ids.additional}
                  rows={2}
                  placeholder="Hybrid, three days a week in Chennai."
                  {...form.register('additional_requirements')}
                />
                <FieldError errors={[errors.additional_requirements]} />
              </Field>
              <Field data-invalid={Boolean(errors.description)}>
                <FieldLabel htmlFor={ids.description}>Full job description</FieldLabel>
                <Textarea
                  id={ids.description}
                  rows={10}
                  placeholder="Describe the role, the team and what success looks like."
                  className="min-h-48"
                  {...form.register('description')}
                />
                <FieldDescription>
                  Headings (# Title) and bullet lines (- item) are rendered in the preview.
                </FieldDescription>
                <FieldError errors={[errors.description]} />
              </Field>
            </FieldGroup>
          </section>

          {/* ------------------------------------------------------------ People */}
          <section
            id="section-people"
            aria-labelledby="heading-people"
            onFocusCapture={() => setActive('people')}
            className={SECTION_CLASS}
          >
            <h2 id="heading-people" className={HEADING_CLASS}>
              People Involved in the Recruitment
            </h2>
            <p className="mt-1 text-small text-ink-muted">
              Everyone who searches, screens, interviews or decides on this role. You are the owner.
            </p>
            <Field data-invalid={Boolean(errors.participants)} className="mt-4">
              <FieldLabel htmlFor={ids.people} className="sr-only">
                People involved
              </FieldLabel>
              <Controller
                control={form.control}
                name="participants"
                render={({ field }) => (
                  <PeoplePicker
                    id={ids.people}
                    value={field.value}
                    onChange={field.onChange}
                    lockedUserId={creator?.id}
                    aria-invalid={Boolean(errors.participants)}
                  />
                )}
              />
              <FieldError errors={[errors.participants]} />
            </Field>
          </section>
        </div>

        {/* Mobile: the action bar sits at the bottom (plan.md 9.5). */}
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-sm md:hidden',
          )}
        >
          {actions}
        </div>
      </form>

      <JobPreviewSheet
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        values={{ ...initialValues, ...(values as Partial<JobFormValues>) }}
        creator={creator}
        status={job?.status ?? 'draft'}
      />

      <ConfirmDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title="Discard unsaved changes?"
        description="Everything you changed on this form will be lost."
        confirmLabel="Discard changes"
        destructive
        onConfirm={() => {
          draft.clear()
          navigate(cancelTo)
        }}
      />

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save changes</DialogTitle>
            <DialogDescription>
              A new version is written when content changed. Add a short note so the team can see
              why.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor={ids.summary}>Change summary (optional)</FieldLabel>
            <Input
              id={ids.summary}
              maxLength={300}
              placeholder="Raised experience to 4–8 years"
              value={changeSummary}
              onChange={(event) => setChangeSummary(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void confirmSummary()
                }
              }}
              autoFocus
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSummaryOpen(false)}>
              Back
            </Button>
            <Button type="button" onClick={() => void confirmSummary()} disabled={isSubmitting}>
              {isSubmitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default JobForm
