import { WorkflowGuide } from '@/components/shared/WorkflowGuide'
import {
  Loader2Icon,
  MailPlusIcon,
  MailsIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { ActionMenu } from '@/components/shared/ActionMenu'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageHeader } from '@/components/shared/PageHeader'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { Badge } from '@/components/ui/badge'
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
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { AiDraftPanel } from '@/features/communications/AiDraftPanel'
import {
  useCreateTemplate,
  useDeleteTemplate,
  useMessageTemplates,
  useUpdateTemplate,
} from '@/features/communications/api'
import { useAuthStore } from '@/lib/auth-store'
import { describeError } from '@/lib/errors'
import { formatRelative } from '@/lib/format'
import type { MessageTemplate } from '@/types/domain'

const PLACEHOLDERS = [
  'candidate_first_name',
  'candidate_name',
  'job_title',
  'job_location',
  'company',
  'recruiter_name',
  'recruiter_email',
]

function TemplateCard({
  template,
  canEdit,
  onEdit,
  onDefault,
  onDelete,
}: {
  template: MessageTemplate
  canEdit: boolean
  onEdit: () => void
  onDefault: () => void
  onDelete: () => void
}) {
  return (
    <li className="section-reveal flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
      <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary">
        <MailsIcon aria-hidden="true" className="size-5" />
      </span>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-h3 font-semibold text-ink">{template.name}</h3>
            {template.is_default && <Badge variant="secondary">Default</Badge>}
          </div>
          <p className="mt-1 text-small text-ink">{template.subject}</p>
        </div>
        {canEdit && (
          <ActionMenu
            label={`Actions for ${template.name}`}
            items={[
              { key: 'edit', label: 'Edit…', icon: PencilIcon, onSelect: onEdit },
              {
                key: 'default',
                label: 'Use as default',
                icon: StarIcon,
                disabled: template.is_default,
                onSelect: onDefault,
              },
              {
                key: 'delete',
                label: 'Delete…',
                icon: Trash2Icon,
                destructive: true,
                separatorBefore: true,
                onSelect: onDelete,
              },
            ]}
          />
        )}
      </div>
      <p className="line-clamp-5 rounded-xl bg-surface-2/70 p-4 text-small leading-6 whitespace-pre-line text-ink-muted">
        {template.body}
      </p>
      <p className="mt-auto text-caption text-ink-subtle">
        Updated {formatRelative(template.updated_at)}
      </p>
    </li>
  )
}

function TemplateEditorDialog({
  open,
  template,
  onOpenChange,
}: {
  open: boolean
  template: MessageTemplate | null
  onOpenChange: (open: boolean) => void
}) {
  const create = useCreateTemplate()
  const update = useUpdateTemplate()
  const busy = create.isPending || update.isPending
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {open && (
          <TemplateEditor
            key={template?.id ?? 'new'}
            template={template}
            busy={busy}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (values) => {
              try {
                if (template) {
                  await update.mutateAsync({ id: template.id, ...values })
                  toast.success(`Saved “${values.name}”`)
                } else {
                  await create.mutateAsync(values)
                  toast.success(`Created “${values.name}”`)
                }
                onOpenChange(false)
              } catch (error) {
                toast.error(describeError(error))
              }
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface TemplateValues {
  name: string
  subject: string
  body: string
  is_default: boolean
}

function TemplateEditor({
  template,
  busy,
  onCancel,
  onSubmit,
}: {
  template: MessageTemplate | null
  busy: boolean
  onCancel: () => void
  onSubmit: (values: TemplateValues) => Promise<void>
}) {
  const ids = { name: useId(), subject: useId(), body: useId(), default: useId() }
  const [values, setValues] = useState<TemplateValues>({
    name: template?.name ?? '',
    subject: template?.subject ?? '',
    body: template?.body ?? '',
    is_default: template?.is_default ?? false,
  })
  const [showAi, setShowAi] = useState(template === null)
  const set = <K extends keyof TemplateValues>(key: K, value: TemplateValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))
  const canSave = !busy && values.name.trim().length > 0 && values.body.trim().length > 0

  return (
    <>
      <DialogHeader>
        <DialogTitle>{template ? `Edit “${template.name}”` : 'New email template'}</DialogTitle>
        <DialogDescription>
          Write it once with placeholders; every recruiter can send it to any candidate.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field className="min-w-56 flex-1">
            <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
            <Input
              id={ids.name}
              maxLength={120}
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              placeholder="Introduction: senior engineering roles"
              autoFocus
            />
          </Field>
          <Button
            type="button"
            variant={showAi ? 'secondary' : 'outline'}
            onClick={() => setShowAi((value) => !value)}
          >
            {showAi ? 'Hide AI draft' : 'Draft with AI'}
          </Button>
        </div>
        {showAi && (
          <AiDraftPanel
            onDraft={(draft) => {
              set('subject', draft.subject)
              set('body', draft.body)
            }}
          />
        )}
        <Field>
          <FieldLabel htmlFor={ids.subject}>Subject</FieldLabel>
          <Input
            id={ids.subject}
            maxLength={200}
            value={values.subject}
            onChange={(event) => set('subject', event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.body}>Message</FieldLabel>
          <Textarea
            id={ids.body}
            rows={14}
            maxLength={10000}
            value={values.body}
            onChange={(event) => set('body', event.target.value)}
          />
          <FieldDescription>
            Placeholders: {PLACEHOLDERS.map((key) => `{${key}}`).join(', ')}.
          </FieldDescription>
        </Field>
        <label htmlFor={ids.default} className="flex items-center gap-3 text-small text-ink">
          <Switch
            id={ids.default}
            checked={values.is_default}
            onCheckedChange={(checked) => set('is_default', checked)}
          />
          Use as the default template when composing
        </label>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="button" disabled={!canSave} onClick={() => void onSubmit(values)}>
          {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          {template ? 'Save changes' : 'Create template'}
        </Button>
      </DialogFooter>
    </>
  )
}

/** Email templates: the reusable outreach texts, with an AI draft to start from. */
export default function EmailTemplatesPage() {
  const user = useAuthStore((state) => state.user)
  const canEdit = user?.role === 'hr_admin' || user?.role === 'hr'
  const list = useMessageTemplates()
  const update = useUpdateTemplate()
  const remove = useDeleteTemplate()
  const [editor, setEditor] = useState<{ open: boolean; template: MessageTemplate | null }>({
    open: false,
    template: null,
  })
  const [deleting, setDeleting] = useState<MessageTemplate | null>(null)
  const templates = list.data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Email templates"
        subtitle="Reusable outreach messages. Placeholders are filled in for each candidate when a recruiter sends one."
        actions={
          canEdit ? (
            <Button type="button" onClick={() => setEditor({ open: true, template: null })}>
              <MailPlusIcon data-icon="inline-start" aria-hidden="true" />
              New template
            </Button>
          ) : undefined
        }
      />
      <WorkflowGuide
        label="Thoughtful outreach, made simple"
        steps={[
          {
            title: 'Write with a head start',
            description: 'Start with your words or draft a message with AI.',
          },
          {
            title: 'Make every hello personal',
            description: 'Placeholders adapt your message to each candidate.',
          },
          {
            title: 'Keep your team in sync',
            description: 'Share reusable templates across your workspace.',
          },
        ]}
      />
      {list.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : list.isError ? (
        <ErrorState
          title="Couldn't load templates"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      ) : templates.length === 0 ? (
        <EmptyState
          icon={MailsIcon}
          title="No templates yet"
          description="Create one by hand or let the AI draft it from a purpose and a role."
          action={
            canEdit ? (
              <Button type="button" onClick={() => setEditor({ open: true, template: null })}>
                New template
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              canEdit={canEdit}
              onEdit={() => setEditor({ open: true, template })}
              onDefault={() =>
                void update
                  .mutateAsync({ id: template.id, is_default: true })
                  .then(() => toast.success(`“${template.name}” is now the default`))
                  .catch((error: unknown) => toast.error(describeError(error)))
              }
              onDelete={() => setDeleting(template)}
            />
          ))}
        </ul>
      )}
      <TemplateEditorDialog
        open={editor.open}
        template={editor.template}
        onOpenChange={(open) => setEditor((prev) => ({ ...prev, open }))}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting ? `Delete “${deleting.name}”?` : 'Delete template'}
        description="Emails already sent keep their text; only the template disappears."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await remove.mutateAsync(deleting.id)
            toast.success('Template deleted')
          } catch (error) {
            toast.error(describeError(error))
            throw error
          }
        }}
      />
    </div>
  )
}
