import {
  CheckIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/shared/EmptyState'
import { ErrorState } from '@/components/shared/ErrorState'
import { MatchBar } from '@/components/shared/MatchBar'
import { MatchRing } from '@/components/shared/MatchRing'
import { SkeletonCard } from '@/components/shared/Skeletons'
import { Button } from '@/components/ui/button'
import { useApplication, useRematch } from '@/features/applications/api'
import { matchVerdict } from '@/features/candidates/candidate-utils'
import { useJob } from '@/features/jobs/api'
import { skillLabel } from '@/features/jobs/job-utils'
import { describeError } from '@/lib/errors'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'

const BREAKDOWN: {
  key:
    | 'skills_score'
    | 'experience_score'
    | 'education_score'
    | 'domain_score'
    | 'responsibility_score'
  label: string
  weight: number
}[] = [
  { key: 'skills_score', label: 'Skills Match', weight: 45 },
  { key: 'experience_score', label: 'Experience Match', weight: 20 },
  { key: 'education_score', label: 'Education Match', weight: 10 },
  { key: 'domain_score', label: 'Domain Match', weight: 10 },
  { key: 'responsibility_score', label: 'Responsibility Match', weight: 15 },
]

function Card({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn('rounded-card border border-line bg-surface p-5 shadow-card', className)}
    >
      <h3 className="mb-3 text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Coverage({
  label,
  chips,
}: {
  label: string
  chips: { name: string; state: 'matched' | 'missing' | 'neutral' }[]
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-start gap-3 py-1.5 max-sm:grid-cols-1 max-sm:gap-1">
      <span className="pt-1 text-small text-ink-muted">{label}</span>
      <ul className="flex flex-wrap gap-1">
        {chips.length === 0 && <li className="text-small text-ink-subtle">None listed</li>}
        {chips.map((chip) => (
          <li
            key={chip.name}
            data-state={chip.state}
            className={cn(
              'inline-flex h-6 items-center gap-1 rounded-pill px-2.5 text-[13px]',
              chip.state === 'matched' && 'bg-success-soft text-success',
              chip.state === 'missing' && 'border border-danger/40 text-danger',
              chip.state === 'neutral' && 'bg-surface-2 text-ink-muted',
            )}
          >
            {chip.state === 'matched' ? (
              <CheckIcon aria-hidden="true" className="size-3" />
            ) : chip.state === 'missing' ? (
              <XIcon aria-hidden="true" className="size-3" />
            ) : (
              <span aria-hidden="true">–</span>
            )}
            {chip.name}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** plan.md 9.10 AI Match Analysis tab for the context application. */
export function MatchAnalysisTab({
  applicationId,
  jobId,
}: {
  applicationId: string
  jobId: string
}) {
  const application = useApplication(applicationId)
  const job = useJob(jobId)
  const rematch = useRematch()

  async function recompute() {
    try {
      const result = await rematch.mutateAsync(applicationId)
      toast.success(`Recomputed: ${Math.round(result.overall_pct)}% match`)
    } catch (error) {
      toast.error(describeError(error))
    }
  }

  if (application.isPending) {
    return (
      <div className="grid gap-5 lg:grid-cols-3">
        <SkeletonCard lines={3} />
        <SkeletonCard lines={5} className="lg:col-span-2" />
      </div>
    )
  }
  if (application.isError) {
    return (
      <ErrorState
        title="Couldn't load the match"
        error={application.error}
        onRetry={() => void application.refetch()}
      />
    )
  }
  const match = application.data.match
  if (!match) {
    return (
      <div className="rounded-card border border-line bg-surface">
        <EmptyState
          icon={SparklesIcon}
          title="Not scored yet"
          description="Run a search or recompute to score this candidate against the role."
          action={
            application.data.permissions.can_transition ? (
              <Button type="button" onClick={() => void recompute()} disabled={rematch.isPending}>
                {rematch.isPending ? (
                  <Loader2Icon aria-hidden="true" className="animate-spin" />
                ) : (
                  <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
                )}
                Recompute
              </Button>
            ) : undefined
          }
        />
      </div>
    )
  }
  const requiredChips = [
    ...match.matched_required_skill_names.map((name) => ({ name, state: 'matched' as const })),
    ...match.missing_required_skill_names.map((name) => ({ name, state: 'missing' as const })),
  ]
  const preferredKeys = job.data?.preferred_skills ?? match.matched_preferred_skills
  const preferredNames = job.data?.preferred_skill_names ?? match.matched_preferred_skill_names
  const matchedPreferred = new Set(match.matched_preferred_skills)
  const preferredChips = preferredKeys.map((key, index) => ({
    name: preferredNames[index] ?? skillLabel(key),
    state: matchedPreferred.has(key) ? ('matched' as const) : ('neutral' as const),
  }))

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Overall match" className="flex flex-col items-center text-center">
          <MatchRing value={match.overall_pct} size="lg" />
          <p className="mt-3 font-medium text-ink">{matchVerdict(match.overall_pct)}</p>
          <p className="mt-1 text-caption text-ink-subtle">
            Engine: {match.engine} v{match.engine_version} • {formatRelative(match.computed_at)}
          </p>
          {application.data.permissions.can_transition && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => void recompute()}
              disabled={rematch.isPending}
            >
              {rematch.isPending ? (
                <Loader2Icon aria-hidden="true" className="animate-spin" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" aria-hidden="true" />
              )}
              Recompute
            </Button>
          )}
        </Card>
        <Card title="Breakdown" className="lg:col-span-2">
          <div className="space-y-4">
            {BREAKDOWN.map((row) => (
              <MatchBar
                key={row.key}
                label={row.label}
                value={match[row.key]}
                weight={row.weight}
              />
            ))}
          </div>
        </Card>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Strengths">
          {match.strengths.length === 0 ? (
            <p className="text-small text-ink-subtle">No standout strengths found.</p>
          ) : (
            <ul className="space-y-2">
              {match.strengths.map((item) => (
                <li key={item} className="flex items-start gap-2 text-small text-ink">
                  <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Gaps">
          {match.gaps.length === 0 ? (
            <p className="text-small text-ink-subtle">No gaps against this role.</p>
          ) : (
            <ul className="space-y-2">
              {match.gaps.map((item) => (
                <li key={item} className="flex items-start gap-2 text-small text-ink">
                  <TriangleAlertIcon
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-warning"
                  />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Card title="Skill coverage">
        <dl className="divide-y divide-line">
          <Coverage label="Required" chips={requiredChips} />
          <Coverage label="Preferred" chips={preferredChips} />
        </dl>
      </Card>
    </div>
  )
}
