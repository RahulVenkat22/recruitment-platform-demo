import { Loader2Icon, SparklesIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useDraftEmail } from '@/features/communications/api'
import { useJobList } from '@/features/jobs/api'
import { describeError } from '@/lib/errors'
import type { EmailDraft } from '@/types/domain'

const PURPOSES = [
  { key: 'introduction', label: 'Introduction: first contact about a role' },
  { key: 'interview_invite', label: 'Interview invitation' },
  { key: 'follow_up', label: 'Follow-up after no reply' },
  { key: 'rejection', label: 'Not selected this time' },
  { key: 'custom', label: 'Custom: describe it below' },
] as const
const TONES = [
  { key: 'friendly', label: 'Friendly' },
  { key: 'formal', label: 'Formal' },
  { key: 'concise', label: 'Concise' },
] as const

const NONE = '__none__'

export interface AiDraftPanelProps {
  /** Fixed when composing for a job's candidates; selectable on the templates page. */
  jobId?: string | null
  onDraft: (draft: EmailDraft) => void
}

/** Purpose, tone, role and free instructions in; a subject and body with placeholders out. */
export function AiDraftPanel({ jobId, onDraft }: AiDraftPanelProps) {
  const ids = { purpose: useId(), tone: useId(), job: useId(), notes: useId() }
  const [purpose, setPurpose] = useState<(typeof PURPOSES)[number]['key']>('introduction')
  const [tone, setTone] = useState<(typeof TONES)[number]['key']>('friendly')
  const [pickedJob, setPickedJob] = useState<string>(NONE)
  const [instructions, setInstructions] = useState('')
  const jobs = useJobList({ page_size: 100, ordering: 'title' })
  const draft = useDraftEmail()
  const job = jobId === undefined ? (pickedJob === NONE ? null : pickedJob) : jobId

  async function generate() {
    try {
      const result = await draft.mutateAsync({
        job_description: job,
        purpose,
        tone,
        instructions: instructions.trim(),
      })
      onDraft(result)
      toast.success(`Drafted with ${result.model}`)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <div className="grid gap-3 rounded-card border border-line bg-surface-2 p-3">
      <p className="flex items-center gap-1.5 text-small font-medium text-ink">
        <SparklesIcon aria-hidden="true" className="size-4 text-accent" />
        Draft with AI
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={ids.purpose}>Purpose</FieldLabel>
          <Select value={purpose} onValueChange={(value) => setPurpose(value as typeof purpose)}>
            <SelectTrigger id={ids.purpose} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PURPOSES.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.tone}>Tone</FieldLabel>
          <Select value={tone} onValueChange={(value) => setTone(value as typeof tone)}>
            <SelectTrigger id={ids.tone} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TONES.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {jobId === undefined && (
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor={ids.job}>Role</FieldLabel>
            <Select value={pickedJob} onValueChange={setPickedJob}>
              <SelectTrigger id={ids.job} className="w-full">
                <SelectValue placeholder="Any role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Any role (generic template)</SelectItem>
                {(jobs.data?.results ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              The role gives the AI context; the text still uses {'{job_title}'} so it works for any
              candidate on that job.
            </FieldDescription>
          </Field>
        )}
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={ids.notes}>Anything to include</FieldLabel>
          <Textarea
            id={ids.notes}
            rows={2}
            maxLength={1000}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Mention the team is remote; ask for a 20-minute call next week…"
          />
        </Field>
      </div>
      <div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={draft.isPending}
          onClick={() => void generate()}
        >
          {draft.isPending ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <SparklesIcon data-icon="inline-start" aria-hidden="true" />
          )}
          Generate draft
        </Button>
      </div>
    </div>
  )
}
