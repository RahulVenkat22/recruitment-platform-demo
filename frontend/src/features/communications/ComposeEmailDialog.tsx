import { Loader2Icon, MailIcon, ShieldAlertIcon, TriangleAlertIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { PipelineTarget } from '@/features/applications/pipeline-target'
import { AiDraftPanel } from '@/features/communications/AiDraftPanel'
import {
  useBulkEmail,
  useCreateTemplate,
  useEmailConfig,
  useEmailPreview,
} from '@/features/communications/api'
import { useAuthStore } from '@/lib/auth-store'
import { describeError } from '@/lib/errors'
import type { EmailConfig, MessageTemplate } from '@/types/domain'

const CUSTOM = '__custom__'
const UNTOUCHED = new Set(['new', 'ai_shortlisted', 'hr_review'])

function hasRealEmail(email: string | null | undefined): boolean {
  return Boolean(email) && !email!.endsWith('@no-email.invalid')
}

function defaultTemplate(templates: MessageTemplate[]): MessageTemplate | undefined {
  return templates.find((template) => template.is_default) ?? templates[0]
}

/** Where the mail really goes: the safe-mode inbox, the console, or the candidates. */
function DeliveryNotice({ config }: { config: EmailConfig | undefined }) {
  if (!config) return null
  if (!config.configured) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon aria-hidden="true" />
        <AlertDescription>
          Email is not configured (EMAIL_HOST is empty). Messages are logged and printed in the
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
          Safe mode is on: every mail is delivered to <strong>{config.safe_recipient}</strong>{' '}
          instead of the candidates. Remove EMAIL_SAFE_RECIPIENT to go live.
        </AlertDescription>
      </Alert>
    )
  }
  return null
}

export interface ComposeEmailDialogProps {
  /** One candidate or a selection; each gets the text filled in with their own details. */
  targets: PipelineTarget[] | null
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}

/**
 * Compose an email to one or many candidates: start from a template or an AI
 * draft, edit the text with placeholders, preview it for any recipient, send.
 * Each send is logged in the contact log and moves an untouched candidate to
 * Contact Pending. HR staff can save the text as a new template on the way.
 */
export function ComposeEmailDialog({ targets, onOpenChange, onDone }: ComposeEmailDialogProps) {
  const open = targets !== null && targets.length > 0
  const send = useBulkEmail()
  const save = useCreateTemplate()
  const busy = send.isPending || save.isPending
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        {targets && targets.length > 0 && (
          <ComposeForm
            key={targets.map((target) => target.id).join(',')}
            targets={targets}
            busy={busy}
            onCancel={() => onOpenChange(false)}
            onSubmit={async (subject, body, saveAs) => {
              try {
                if (saveAs) {
                  await save.mutateAsync({ name: saveAs, subject, body, is_default: false })
                }
                const result = await send.mutateAsync({
                  ids: targets.map((target) => target.id),
                  subject,
                  body,
                })
                const skipped = Object.keys(result.skipped).length
                toast.success(
                  `Sent ${result.sent.length} ${result.sent.length === 1 ? 'email' : 'emails'}` +
                    (skipped ? `, ${skipped} skipped` : '') +
                    (saveAs ? ` · saved template “${saveAs}”` : ''),
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

function ComposeForm({
  targets,
  busy,
  onCancel,
  onSubmit,
}: {
  targets: PipelineTarget[]
  busy: boolean
  onCancel: () => void
  onSubmit: (subject: string, body: string, saveAs: string) => Promise<void>
}) {
  const ids = { template: useId(), subject: useId(), body: useId(), save: useId(), name: useId() }
  const user = useAuthStore((state) => state.user)
  const canSaveTemplate = user?.role === 'hr_admin' || user?.role === 'hr'
  const config = useEmailConfig()
  const templates = config.data?.templates ?? []

  // '' = the default template. Editing or drafting switches to a custom text.
  const [templateId, setTemplateId] = useState('')
  const [text, setText] = useState<{ subject: string; body: string } | null>(null)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [previewFor, setPreviewFor] = useState(targets[0].id)
  const [showAi, setShowAi] = useState(false)
  const [saveAs, setSaveAs] = useState(false)
  const [saveName, setSaveName] = useState('')

  const selectedTemplate = templates.find(
    (t) => t.id === (templateId || defaultTemplate(templates)?.id),
  )
  const subject = text?.subject ?? selectedTemplate?.subject ?? ''
  const body = text?.body ?? selectedTemplate?.body ?? ''
  const selectValue = text ? CUSTOM : (selectedTemplate?.id ?? '')

  const known = targets.filter((target) => target.candidate.email !== undefined)
  const withoutEmail = known.filter((target) => !hasRealEmail(target.candidate.email)).length
  const moving = targets.filter((target) => UNTOUCHED.has(target.status)).length
  const previewTarget = targets.find((target) => target.id === previewFor) ?? targets[0]
  const preview = useEmailPreview(
    previewTarget.id,
    { subject, body },
    tab === 'preview' && subject.trim().length > 0 && body.trim().length > 0,
  )

  const canSend =
    !busy &&
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (!saveAs || saveName.trim().length > 0) &&
    withoutEmail < targets.length

  const names = targets.map((target) => target.candidate.full_name)
  const recipients =
    names.length <= 4
      ? names.join(', ')
      : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {targets.length === 1 ? `Email ${names[0]}` : `Email ${targets.length} candidates`}
        </DialogTitle>
        <DialogDescription>
          {targets.length > 1 ? `To ${recipients}. ` : ''}
          Each mail is filled in with the candidate's own details, logged in the contact log
          {moving > 0
            ? `, and moves ${moving === targets.length ? (targets.length === 1 ? 'them' : 'all of them') : `${moving} of them`} to Contact Pending.`
            : '.'}
          {withoutEmail > 0
            ? ` ${withoutEmail} ${withoutEmail === 1 ? 'has' : 'have'} no email address and will be skipped.`
            : ''}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <DeliveryNotice config={config.data} />

        <div className="flex flex-wrap items-end gap-3">
          <Field className="min-w-56 flex-1">
            <FieldLabel htmlFor={ids.template}>Start from</FieldLabel>
            <Select
              value={selectValue}
              onValueChange={(value) => {
                if (value === CUSTOM) return
                setTemplateId(value)
                setText(null)
              }}
              disabled={templates.length === 0}
            >
              <SelectTrigger id={ids.template} className="w-full">
                <SelectValue placeholder="Choose a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
                {text && <SelectItem value={CUSTOM}>Custom text (edited)</SelectItem>}
              </SelectContent>
            </Select>
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
            jobId={targets[0].job_description}
            onDraft={(draft) => {
              setText({ subject: draft.subject, body: draft.body })
              setTab('write')
            }}
          />
        )}

        <Tabs value={tab} onValueChange={(value) => setTab(value as 'write' | 'preview')}>
          <TabsList variant="line" className="w-full justify-start border-b border-line">
            <TabsTrigger value="write" className="flex-none px-3">
              Write
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex-none px-3">
              Preview
            </TabsTrigger>
          </TabsList>
          <TabsContent value="write" className="grid gap-4 pt-3">
            <Field>
              <FieldLabel htmlFor={ids.subject}>Subject</FieldLabel>
              <Input
                id={ids.subject}
                maxLength={200}
                value={subject}
                onChange={(event) => setText({ subject: event.target.value, body })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.body}>Message</FieldLabel>
              <Textarea
                id={ids.body}
                rows={12}
                maxLength={10000}
                value={body}
                onChange={(event) => setText({ subject, body: event.target.value })}
              />
              <FieldDescription>
                Placeholders are filled per candidate: {'{candidate_first_name}'},{' '}
                {'{candidate_name}'}, {'{job_title}'}, {'{job_location}'}, {'{company}'},{' '}
                {'{recruiter_name}'}, {'{recruiter_email}'}.
                {config.data?.reply_to ? ` Replies go to ${config.data.reply_to}.` : ''}
              </FieldDescription>
            </Field>
          </TabsContent>
          <TabsContent value="preview" className="grid gap-3 pt-3">
            {targets.length > 1 && (
              <Field>
                <FieldLabel>Preview as</FieldLabel>
                <Select value={previewTarget.id} onValueChange={setPreviewFor}>
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((target) => (
                      <SelectItem key={target.id} value={target.id}>
                        {target.candidate.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {preview.isPending ? (
              <p className="text-small text-ink-muted">Rendering…</p>
            ) : preview.isError ? (
              <p className="text-small text-danger">{describeError(preview.error)}</p>
            ) : preview.data ? (
              <div className="rounded-card border border-line bg-surface p-4 text-small">
                <p className="text-ink-muted">
                  To: <span className="text-ink">{preview.data.to || '—'}</span>
                  {!preview.data.can_send && (
                    <span className="ml-2 text-danger">{preview.data.reason}</span>
                  )}
                </p>
                <p className="mt-2 font-medium text-ink">{preview.data.subject}</p>
                <p className="mt-2 whitespace-pre-line text-ink">{preview.data.body}</p>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>

        {canSaveTemplate && (
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={ids.save} className="flex items-center gap-2 text-small text-ink">
              <Checkbox
                id={ids.save}
                checked={saveAs}
                onCheckedChange={(checked) => setSaveAs(checked === true)}
              />
              Save this text as a template
            </label>
            {saveAs && (
              <Input
                id={ids.name}
                className="w-64"
                maxLength={120}
                placeholder="Template name"
                value={saveName}
                onChange={(event) => setSaveName(event.target.value)}
              />
            )}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!canSend}
          onClick={() => void onSubmit(subject.trim(), body.trim(), saveAs ? saveName.trim() : '')}
        >
          {busy ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <MailIcon data-icon="inline-start" aria-hidden="true" />
          )}
          {targets.length === 1
            ? 'Send email'
            : `Send ${targets.length - withoutEmail} ${targets.length - withoutEmail === 1 ? 'email' : 'emails'}`}
        </Button>
      </DialogFooter>
    </>
  )
}
