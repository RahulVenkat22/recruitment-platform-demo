import { CheckIcon, Loader2Icon, RocketIcon } from 'lucide-react'
import { toast } from 'sonner'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { useCompleteOnboarding, useUpdateOnboarding } from '@/features/onboarding/api'
import { describeError } from '@/lib/errors'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { personFromUser, type Onboarding } from '@/types/domain'

const STATUS_CLASS: Record<string, string> = {
  not_started: 'bg-surface-2 text-ink-muted',
  documents_pending: 'bg-warning-soft text-warning',
  in_progress: 'bg-info-soft text-info',
  completed: 'bg-success-soft text-success',
  dropped: 'bg-danger-soft text-danger',
}

/** The onboarding checklist on an application; ticks save at once, Complete finishes the journey. */
export function OnboardingCard({ onboarding }: { onboarding: Onboarding }) {
  const update = useUpdateOnboarding()
  const complete = useCompleteOnboarding()
  const manage = onboarding.permissions.can_manage
  const closed = onboarding.status === 'completed' || onboarding.status === 'dropped'
  const editable = manage && !closed
  const { done, total } = onboarding.progress
  const name = onboarding.application.candidate.full_name

  async function toggle(key: string, next: boolean) {
    try {
      await update.mutateAsync({ id: onboarding.id, body: { checklist: [{ key, done: next }] } })
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  async function finish() {
    try {
      await complete.mutateAsync(onboarding.id)
      toast.success(`${name} is onboarded`)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  return (
    <section
      data-slot="onboarding-card"
      data-status={onboarding.status}
      className="rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="inline-flex size-8 items-center justify-center rounded-full bg-success-soft text-success">
          <RocketIcon aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-h3 text-ink">Onboarding</h3>
            <span
              className={cn(
                'inline-flex h-5 items-center rounded-pill px-2 text-caption font-medium',
                STATUS_CLASS[onboarding.status] ?? 'bg-surface-2 text-ink-muted',
              )}
            >
              {onboarding.status_label}
            </span>
            <span className="text-caption text-ink-subtle tabular-nums">
              {done} of {total} done
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-small text-ink-muted">
            <span>
              Starts <span className="text-ink">{formatDate(onboarding.start_date)}</span>
            </span>
            {onboarding.buddy && (
              <span className="inline-flex items-center gap-1.5">
                Buddy <UserChip user={personFromUser(onboarding.buddy)} />
              </span>
            )}
            {onboarding.hr_contact && (
              <span className="inline-flex items-center gap-1.5">
                HR contact <UserChip user={personFromUser(onboarding.hr_contact)} />
              </span>
            )}
            {onboarding.completed_at && (
              <span>Completed {formatDateTime(onboarding.completed_at)}</span>
            )}
          </div>
        </div>
        {editable && (
          <Button size="sm" onClick={() => void finish()} disabled={complete.isPending}>
            {complete.isPending ? (
              <Loader2Icon aria-hidden="true" className="animate-spin" />
            ) : (
              <CheckIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {done === total ? 'Mark onboarded' : 'Complete onboarding'}
          </Button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Checklist progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} done`}
        className="mt-4 h-1.5 overflow-hidden rounded-pill bg-surface-3"
      >
        <div
          className="h-full rounded-pill bg-success transition-[width] duration-300"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Onboarding checklist">
        {onboarding.checklist.map((item) => (
          <li
            key={item.key}
            className="flex items-start gap-3 rounded-control bg-surface-2 px-3 py-2"
          >
            <Checkbox
              id={`check-${onboarding.id}-${item.key}`}
              checked={item.done}
              disabled={!editable || update.isPending}
              onCheckedChange={(value) => void toggle(item.key, value === true)}
              aria-label={item.label}
              className="mt-0.5"
            />
            <label
              htmlFor={`check-${onboarding.id}-${item.key}`}
              className="min-w-0 flex-1 text-small"
            >
              <span className={cn('block', item.done ? 'text-ink-muted line-through' : 'text-ink')}>
                {item.label}
              </span>
              {item.done_at && (
                <span className="block text-caption text-ink-subtle">
                  {formatDateTime(item.done_at)}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
      {onboarding.notes && <p className="mt-3 text-small text-ink-muted">{onboarding.notes}</p>}
    </section>
  )
}
