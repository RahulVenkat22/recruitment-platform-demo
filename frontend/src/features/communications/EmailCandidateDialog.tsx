import { Loader2Icon, MailIcon, ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { PipelineTarget } from '@/features/applications/pipeline-target'
import {
  useBulkEmail,
  useEmailConfig,
  useEmailPreview,
  useSendEmail,
} from '@/features/communications/api'
import { describeError } from '@/lib/errors'
import type { ApplicationRow, EmailConfig, MessageTemplate } from '@/types/domain'

function defaultTemplate(templates: MessageTemplate[]): MessageTemplate | undefined {
  return templates.find((template) => template.is_default) ?? templates[0]
}

/** Placeholder identities from resume ingestion are not real addresses. */
function hasRealEmail(email: string | null | undefined): boolean {
  return Boolean(email) && !email!.endsWith('@no-email.invalid')
}

/** Where the mail really goes: the safe-mode inbox, the console, or the candidate. */
function DeliveryNotice({ config }: { config: EmailConfig | undefined }) {
  if (!config) return null
  if (!config.configured) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon aria-hidden="true" />
        <AlertDescription>
          Email is not configured (EMAIL_HOST is empty). The message is logged and printed in the
          server log; nothing is delivered.
        </AlertDescription>
      </Alert>
    )
  }
  if (config.safe_recipient) {
    return (
      <Alert>
        <ShieldAlertIcon aria-hidden="true" />
        <AlertDescription>
          Safe mode is on: this mail is delivered to <strong>{config.safe_recipient}</strong>{' '}
          instead of the candidate. Remove EMAIL_SAFE_RECIPIENT to go live.
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

function TemplateSelect({
  id,
  templates,
  value,
  onChange,
}: {
  id: string
  templates: MessageTemplate[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={templates.length === 0}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Choose a template" />
      </SelectTrigger>
      <SelectContent>
        {templates.map((template) => (
          <SelectItem key={template.id} value={template.id}>
            {template.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export interface EmailCandidateDialogProps {
  application: PipelineTarget | null
  onOpenChange: (open: boolean) => void
  onSent?: () => void
}

/**
 * "Email candidate": pick a template, see it rendered for this candidate, edit
 * the wording, send. The send is logged as an outbound email in the contact
 * log and moves a New / AI Shortlisted candidate to Contact Pending.
 */
export function EmailCandidateDialog({
  application,
  onOpenChange,
  onSent,
}: EmailCandidateDialogProps) {
  const open = application !== null
  const send = useSendEmail()
  return (
    <Dialog open={open} onOpenChange={(next) => !send.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        {application && (
          <EmailForm
            key={application.id}
            application={application}
            pending={send.isPending}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (subject, body, safeRecipient) => {
              try {
                await send.mutateAsync({ id: application.id, subject, body })
                toast.success(
                  safeRecipient
                    ? `Test mail for ${application.candidate.full_name} sent to ${safeRecipient}`
                    : `Email sent to ${application.candidate.full_name}`,
                )
                onSent?.()
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

function EmailForm({
  application,
  pending,
  onCancel,
  onSubmit,
}: {
  application: PipelineTarget
  pending: boolean
  onCancel: () => void
  onSubmit: (subject: string, body: string, safeRecipient: string) => Promise<void>
}) {
  const ids = { template: useId(), subject: useId(), body: useId() }
  const config = useEmailConfig()
  const templates = config.data?.templates ?? []
  // '' means "the default template"; picking one resets any edits.
  const [templateId, setTemplateId] = useState('')
  const [draft, setDraft] = useState<{ subject: string; body: string } | null>(null)
  const selected = templateId || defaultTemplate(templates)?.id || ''
  const preview = useEmailPreview(application.id, selected)

  const subject = draft?.subject ?? preview.data?.subject ?? ''
  const body = draft?.body ?? preview.data?.body ?? ''
  const to = preview.data?.to ?? ''
  const blocked = preview.data ? !preview.data.can_send : false
  const canSend =
    !pending &&
    !preview.isPending &&
    !blocked &&
    subject.trim().length > 0 &&
    body.trim().length > 0
  const name = application.candidate.full_name
  const willMove = ['new', 'ai_shortlisted', 'hr_review'].includes(application.status)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Email {name}</DialogTitle>
        <DialogDescription>
          {to ? `To ${to}. ` : ''}Logged in the contact log and on the timeline.
          {willMove ? ' Sending moves them to Contact Pending.' : ''}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <DeliveryNotice config={config.data} />
        {blocked && (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertDescription>{preview.data?.reason}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor={ids.template}>Template</FieldLabel>
          <TemplateSelect
            id={ids.template}
            templates={templates}
            value={selected}
            onChange={(id) => {
              setTemplateId(id)
              setDraft(null)
            }}
          />
          <FieldDescription>
            Filled in for {name}; edit the text below before sending.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.subject}>Subject</FieldLabel>
          <Input
            id={ids.subject}
            maxLength={200}
            value={subject}
            disabled={preview.isPending}
            onChange={(event) => setDraft({ subject: event.target.value, body })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.body}>Message</FieldLabel>
          <Textarea
            id={ids.body}
            rows={12}
            maxLength={10000}
            value={body}
            disabled={preview.isPending}
            onChange={(event) => setDraft({ subject, body: event.target.value })}
          />
          {config.data?.reply_to && (
            <FieldDescription>Replies go to {config.data.reply_to}.</FieldDescription>
          )}
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSend}
          onClick={() =>
            void onSubmit(subject.trim(), body.trim(), config.data?.safe_recipient ?? '')
          }
        >
          {pending ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <MailIcon data-icon="inline-start" aria-hidden="true" />
          )}
          Send email
        </Button>
      </DialogFooter>
    </>
  )
}

export interface BulkEmailDialogProps {
  rows: ApplicationRow[] | null
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}

/** "Email selected": one template, one personalised mail per candidate. */
export function BulkEmailDialog({ rows, onOpenChange, onDone }: BulkEmailDialogProps) {
  const open = rows !== null
  const send = useBulkEmail()
  return (
    <Dialog open={open} onOpenChange={(next) => !send.isPending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        {rows && (
          <BulkEmailForm
            key={rows.map((row) => row.id).join(',')}
            rows={rows}
            pending={send.isPending}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (templateId) => {
              try {
                const result = await send.mutateAsync({
                  ids: rows.map((row) => row.id),
                  template_id: templateId,
                })
                const skipped = Object.keys(result.skipped).length
                toast.success(
                  `Sent ${result.sent.length} ${result.sent.length === 1 ? 'email' : 'emails'}` +
                    (skipped ? `, ${skipped} skipped` : ''),
                  skipped
                    ? { description: Object.values(result.skipped).slice(0, 3).join(' · ') }
                    : undefined,
                )
                onDone?.()
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

function BulkEmailForm({
  rows,
  pending,
  onCancel,
  onSubmit,
}: {
  rows: ApplicationRow[]
  pending: boolean
  onCancel: () => void
  onSubmit: (templateId: string) => Promise<void>
}) {
  const id = useId()
  const config = useEmailConfig()
  const templates = config.data?.templates ?? []
  const [templateId, setTemplateId] = useState('')
  const selected = templateId || defaultTemplate(templates)?.id || ''
  const withEmail = rows.filter((row) => hasRealEmail(row.candidate.email)).length
  const withoutEmail = rows.length - withEmail
  const template = templates.find((item) => item.id === selected)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Email {rows.length} candidates</DialogTitle>
        <DialogDescription>
          Each candidate gets the template filled in with their own name and the role.
          {withoutEmail > 0
            ? ` ${withoutEmail} ${withoutEmail === 1 ? 'has' : 'have'} no email address and will be skipped.`
            : ''}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <DeliveryNotice config={config.data} />
        <Field>
          <FieldLabel htmlFor={id}>Template</FieldLabel>
          <TemplateSelect id={id} templates={templates} value={selected} onChange={setTemplateId} />
        </Field>
        {template && (
          <div className="rounded-card border border-line bg-surface-2 p-3 text-small text-ink-muted">
            <p className="font-medium text-ink">{template.subject}</p>
            <p className="mt-1 line-clamp-6 whitespace-pre-line">{template.body}</p>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={pending || !selected || withEmail === 0}
          onClick={() => void onSubmit(selected)}
        >
          {pending ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <MailIcon data-icon="inline-start" aria-hidden="true" />
          )}
          Send {withEmail} {withEmail === 1 ? 'email' : 'emails'}
        </Button>
      </DialogFooter>
    </>
  )
}
