import {
  ArrowUpRightIcon,
  BanIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClockIcon,
  LoaderCircleIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useDecideAction, type ActionDecision } from '@/features/assistant/api'
import { describeError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { AssistantStep } from '@/types/domain'

const STATUS: Record<
  AssistantStep['status'],
  { icon: LucideIcon; tone: string; label: string; spin?: boolean }
> = {
  running: { icon: LoaderCircleIcon, tone: 'text-primary', label: 'Working', spin: true },
  done: { icon: CircleCheckIcon, tone: 'text-success', label: 'Done' },
  failed: { icon: CircleXIcon, tone: 'text-danger', label: 'Failed' },
  pending: { icon: ClockIcon, tone: 'text-warning', label: 'Needs your confirmation' },
  cancelled: { icon: BanIcon, tone: 'text-ink-subtle', label: 'Cancelled' },
}

export interface ActionCardProps {
  step: AssistantStep
  /** False while the turn is still streaming: a pending card cannot be decided yet. */
  interactive?: boolean
  className?: string
}

/**
 * One action the assistant took (or wants to take): what it is, how it went, and
 * where to look. A pending action shows what it would do and waits for Confirm
 * or Cancel; both rewrite the stored turn.
 */
export function ActionCard({ step, interactive = true, className }: ActionCardProps) {
  const decide = useDecideAction()
  const [deciding, setDeciding] = useState<ActionDecision | null>(null)
  const meta = STATUS[step.status] ?? STATUS.done
  const Icon = meta.icon
  const pending = step.status === 'pending'

  async function onDecide(decision: ActionDecision) {
    setDeciding(decision)
    try {
      const message = await decide.mutateAsync({ stepId: step.id, decision })
      const updated = message.steps.find((row) => row.id === step.id)
      if (decision === 'cancel') toast('Action cancelled')
      else if (updated?.status === 'failed') toast.error(updated.error || 'The action failed')
      else toast.success(updated?.result?.summary || 'Done')
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setDeciding(null)
    }
  }

  return (
    <div
      data-slot="assistant-action"
      data-status={step.status}
      className={cn(
        'rounded-card border bg-surface px-3.5 py-3 text-small shadow-card',
        pending ? 'border-warning/40 bg-warning-soft/40' : 'border-line',
        step.status === 'failed' && 'border-danger/30',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Icon
          aria-hidden="true"
          className={cn('mt-0.5 size-4 shrink-0', meta.tone, meta.spin && 'animate-spin')}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink [overflow-wrap:anywhere]">{step.label}</p>
          <p className="text-caption text-ink-subtle">
            <span className="sr-only">Status: </span>
            {meta.label}
          </p>
        </div>
      </div>

      {step.status === 'done' && step.result && (
        <div className="mt-2 space-y-2 pl-6.5">
          <p className="text-ink-muted [overflow-wrap:anywhere]">{step.result.summary}</p>
          {step.result.link && (
            <Button asChild variant="outline" size="xs">
              <Link to={step.result.link}>
                {step.result.link_label || 'Open'}
                <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      )}

      {step.status === 'failed' && (
        <p role="alert" className="mt-2 pl-6.5 text-danger [overflow-wrap:anywhere]">
          {step.error || 'The action failed.'}
        </p>
      )}

      {pending && (
        <div className="mt-3 space-y-3 pl-6.5">
          {step.details && step.details.length > 0 && (
            <dl className="space-y-1.5">
              {step.details.map((detail) => (
                <div key={detail.label} className="flex gap-2">
                  <dt className="w-24 shrink-0 text-caption text-ink-subtle">{detail.label}</dt>
                  <dd className="min-w-0 text-ink [overflow-wrap:anywhere]">{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {step.body && (
            <pre className="max-h-56 overflow-y-auto rounded-control border border-line bg-bg px-3 py-2 font-sans text-small/[21px] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
              {step.body}
            </pre>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!interactive || deciding !== null}
              onClick={() => void onDecide('confirm')}
            >
              {deciding === 'confirm' && (
                <LoaderCircleIcon
                  data-icon="inline-start"
                  aria-hidden="true"
                  className="animate-spin"
                />
              )}
              Confirm
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!interactive || deciding !== null}
              onClick={() => void onDecide('cancel')}
            >
              Cancel
            </Button>
            {!interactive && (
              <span className="self-center text-caption text-ink-subtle">Finishing the reply…</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
