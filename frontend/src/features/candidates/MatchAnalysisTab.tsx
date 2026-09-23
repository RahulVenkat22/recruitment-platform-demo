import {
  BotIcon,
  CheckIcon,
  Loader2Icon,
  QuoteIcon,
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
import type { CandidateMatch, SemanticDetails } from '@/types/domain'

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

function Signal({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <span className="inline-flex h-7 items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 text-small tabular-nums">
      <span className="text-ink-muted">{label}</span>
      <span className="font-medium text-ink">
        {value}
        {suffix}
      </span>
    </span>
  )
}

/**
 * The LLM's verdict for a hybrid match (engine `hybrid_semantic`): the
 * grounded explanation, what it found and missed, the resume excerpts it was
 * shown, and the three signals that were blended into the overall score.
 */
function AIEvaluation({ match }: { match: CandidateMatch }) {
  const details = (match.semantic_details ?? null) as SemanticDetails | null
  if (!match.explanation && !details) return null
  const matched = details?.matched_skills ?? []
  const missing = details?.missing_skills ?? []
  const evidence = details?.evidence ?? []
  const evaluated = details?.llm_score !== null && details?.llm_score !== undefined
  return (
    <Card title="AI evaluation" className="border-accent/50">
      <div className="space-y-4">
        {match.explanation ? (
          <p className="flex items-start gap-2 text-[15px]/[24px] text-ink">
            <BotIcon aria-hidden="true" className="mt-1 size-4 shrink-0 text-accent-ink" />
            <span>{match.explanation}</span>
          </p>
        ) : (
          <p className="text-small text-ink-muted">
            This candidate was ranked by the rules and resume similarity; the AI reviewed only the
            top of the pool for this search.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {typeof details?.rule_pct === 'number' && (
            <Signal label="Rules" value={Math.round(details.rule_pct)} suffix="%" />
          )}
          {typeof details?.retrieval_score === 'number' && (
            <Signal
              label="Resume similarity"
              value={Math.round(details.retrieval_score * 100)}
              suffix="%"
            />
          )}
          {evaluated && (
            <Signal label="AI score" value={Math.round(details!.llm_score as number)} suffix="%" />
          )}
          {details?.meets_experience_requirement !== undefined && evaluated && (
            <span
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-pill px-2.5 text-small',
                details.meets_experience_requirement
                  ? 'bg-success-soft text-success'
                  : 'bg-warning-soft text-warning',
              )}
            >
              {details.meets_experience_requirement ? (
                <CheckIcon aria-hidden="true" className="size-3" />
              ) : (
                <TriangleAlertIcon aria-hidden="true" className="size-3" />
              )}
              {details.meets_experience_requirement ? 'Experience fits' : 'Experience below ask'}
            </span>
          )}
        </div>
        {(matched.length > 0 || missing.length > 0) && (
          <dl className="divide-y divide-line">
            <Coverage
              label="Found"
              chips={matched.map((name) => ({ name, state: 'matched' as const }))}
            />
            <Coverage
              label="Not found"
              chips={missing.map((name) => ({ name, state: 'missing' as const }))}
            />
          </dl>
        )}
        {evidence.length > 0 && (
          <div>
            <h4 className="mb-2 text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase">
              Resume evidence
            </h4>
            <ul className="space-y-2">
              {evidence.slice(0, 3).map((item, index) => (
                <li
                  key={`${item.section}-${index}`}
                  className="flex items-start gap-2 rounded-control bg-surface-2 p-3 text-small text-ink"
                >
                  <QuoteIcon
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-ink-subtle"
                  />
                  <span>
                    <span className="mr-1.5 rounded-pill bg-surface px-1.5 py-0.5 text-caption text-ink-muted capitalize">
                      {item.section}
                    </span>
                    {item.excerpt}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {details?.summary_model && !evaluated && (
          <p className="text-caption text-ink-subtle">
            Written by {details.summary_model} from the scoring facts; the AI reviewed only the top
            of the pool in depth for this search.
          </p>
        )}
        {details?.model && (
          <p className="text-caption text-ink-subtle">
            Evaluated by {details.model}
            {details.seconds ? ` in ${Math.round(details.seconds)}s` : ''} · only the supplied
            profile and excerpts were used
            {details.dropped_claims?.length
              ? `; ${details.dropped_claims.length} unsupported claim(s) were discarded`
              : ''}
            .
          </p>
        )}
      </div>
    </Card>
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
      <AIEvaluation match={match} />
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
