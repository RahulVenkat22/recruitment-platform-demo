import {
  ArrowRightIcon,
  CalendarClockIcon,
  ExternalLinkIcon,
  LinkIcon,
  MailIcon,
  MessageCircleIcon,
  PhoneIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { Avatar } from '@/components/shared/Avatar'
import { SourceBadge } from '@/components/shared/SourceBadge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { FALLBACK_JD_STATUS, FALLBACK_STATUS, humanise } from '@/lib/enums'
import { formatCurrencyINR, formatDate, formatDateTime } from '@/lib/format'
import {
  changesOf,
  humaniseField,
  metaNumber,
  metaPeople,
  metaPerson,
  metaString,
  metaStrings,
  reasonOf,
  type FieldChange,
  type Metadata,
} from '@/lib/timeline'
import { cn } from '@/lib/utils'
import type { Activity } from '@/types/domain'

export interface TimelineItemDetailsProps {
  item: Activity
  /** Adds `?jd=` to candidate links so the candidate page opens in this JD's context. */
  jobId?: string
}

function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-pill bg-surface-2 px-2 text-caption text-ink-muted',
        className,
      )}
    >
      {children}
    </span>
  )
}

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  phone: PhoneIcon,
  email: MailIcon,
  linkedin: LinkIcon,
  whatsapp: MessageCircleIcon,
  in_person: UsersIcon,
}

const RECOMMENDATION_CLASS: Record<string, string> = {
  strong_proceed: 'bg-success-soft text-success',
  proceed: 'bg-success-soft text-success',
  hold: 'bg-warning-soft text-warning',
  reject: 'bg-danger-soft text-danger',
}

function candidateHref(id: string, jobId?: string): string {
  return jobId ? `/candidates/${id}?jd=${jobId}` : `/candidates/${id}`
}

/** A stored value as a badge when it is a known status key, otherwise as words. */
function ValueChip({ raw, text }: { raw: unknown; text: string }) {
  if (typeof raw === 'string') {
    if (raw in FALLBACK_STATUS) return <StatusBadge status={raw} dot />
    if (raw in FALLBACK_JD_STATUS) return <StatusBadge status={raw} kind="jd_status" dot />
  }
  return (
    <span className="rounded-control bg-surface px-1.5 py-0.5 text-small font-medium text-ink ring-1 ring-line">
      {text}
    </span>
  )
}

function ChangeRow({ change }: { change: FieldChange }) {
  // A first status (a candidate found by a search) has nothing to show as "From".
  const hasFrom = change.fromRaw !== null && change.fromRaw !== undefined && change.fromRaw !== ''
  return (
    <div className="contents">
      <dt className="pt-0.5 text-caption text-ink-subtle">{change.label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {hasFrom && (
          <>
            <span className="text-caption text-ink-subtle">From</span>
            <ValueChip raw={change.fromRaw} text={change.from} />
            <ArrowRightIcon aria-hidden="true" className="size-3.5 text-ink-subtle" />
            <span className="text-caption text-ink-subtle">To</span>
          </>
        )}
        <ValueChip raw={change.toRaw} text={change.to} />
      </dd>
    </div>
  )
}

/**
 * What changed, as a person reads it (Enhancement.md 5): every From → To the
 * event carries, the reason or note that was given, and who made the change and
 * when. Returns null for events that changed nothing.
 */
export function TimelineChanges({ item }: { item: Activity }) {
  const meta = (item.metadata ?? {}) as Metadata
  const changes = changesOf(meta, item.event_type)
  const reason = reasonOf(meta)
  if (changes.length === 0 && !reason) return null

  return (
    <dl
      data-slot="timeline-changes"
      className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 rounded-control bg-surface-2 px-3 py-2.5"
    >
      {changes.map((change) => (
        <ChangeRow key={change.field} change={change} />
      ))}
      {reason && (
        <div className="contents">
          <dt className="pt-0.5 text-caption text-ink-subtle">{reason.label}</dt>
          <dd className="min-w-0 text-small break-words whitespace-pre-line text-ink">
            {reason.text}
          </dd>
        </div>
      )}
      <div className="contents">
        <dt className="pt-0.5 text-caption text-ink-subtle">
          {changes.length > 0 ? 'Changed by' : 'By'}
        </dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink">
          {item.actor ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar name={item.actor.full_name} src={item.actor.avatar_url} size="xs" />
              <span className="font-medium">{item.actor.full_name}</span>
            </span>
          ) : (
            <span className="font-medium">System</span>
          )}
          <span className="text-ink-subtle">· {formatDateTime(item.occurred_at)}</span>
        </dd>
      </div>
    </dl>
  )
}

/**
 * The per-category detail block under a timeline title (plan.md 8.4 "TimelineItem
 * details by category"). Status moves and reasons are rendered by
 * `TimelineChanges`, so this only adds what the category knows on top.
 */
export function TimelineItemDetails({ item, jobId }: TimelineItemDetailsProps) {
  const meta = (item.metadata ?? {}) as Metadata
  const wrap = 'mt-1.5 flex flex-wrap items-center gap-1.5'

  switch (item.category) {
    case 'job_description': {
      const changed = metaStrings(meta, 'changed_fields')
      const detailed = new Set(Object.keys((meta.changes as object | undefined) ?? {}))
      const summarised = changed.filter((field) => !detailed.has(field))
      const people = metaPeople(meta, 'participants')
      const version = metaNumber(meta, 'version')
      const sourceTitle = metaString(meta, 'source_title')
      if (
        !summarised.length &&
        !people.length &&
        !sourceTitle &&
        !(version && item.event_type === 'jd.updated')
      )
        return null
      return (
        <div className={wrap}>
          {summarised.map((field) => (
            <Pill key={field}>{humaniseField(field)} updated</Pill>
          ))}
          {people.map((person) => (
            <Pill key={person.id ?? person.name}>
              {person.name}
              {person.role && <span className="text-ink-subtle">· {humanise(person.role)}</span>}
            </Pill>
          ))}
          {sourceTitle && (
            <span className="text-small text-ink-muted">Copied from “{sourceTitle}”</span>
          )}
          {version !== null && item.event_type === 'jd.updated' && (
            <Link
              to={`/jobs/${item.job_description}?tab=versions&version=${version}`}
              className="inline-flex h-5 items-center gap-1 rounded-control text-caption font-medium text-primary hover:underline"
            >
              View version {version}
            </Link>
          )}
        </div>
      )
    }
    case 'candidate_search': {
      const sources = metaStrings(meta, 'sources')
      const found = metaNumber(meta, 'total_found') ?? metaNumber(meta, 'count')
      const shortlisted = metaNumber(meta, 'shortlisted')
      const match = metaNumber(meta, 'match_pct')
      if (!sources.length && found === null && match === null) return null
      return (
        <div className={wrap}>
          {sources.length > 0 && <SourceBadge source={sources} />}
          {found !== null && (
            <span className="text-small text-ink-muted">
              <span className="font-medium text-ink tabular-nums">{found}</span> candidates found
            </span>
          )}
          {shortlisted !== null && (
            <span className="text-small text-ink-muted">
              • <span className="font-medium text-ink tabular-nums">{shortlisted}</span> AI
              shortlisted
            </span>
          )}
          {match !== null && (
            <Pill className="bg-primary-soft font-medium text-primary tabular-nums">
              AI match {Math.round(match)}%
            </Pill>
          )}
        </div>
      )
    }
    case 'candidate_shortlisted': {
      const people = metaPeople(meta, 'candidates')
      const list = people.length
        ? people
        : item.candidate
          ? [
              {
                id: item.candidate.id,
                name: item.candidate.full_name,
                avatar_url: item.candidate.avatar_url,
              },
            ]
          : []
      if (!list.length) return null
      return (
        <div className={wrap}>
          {list.map((person) => (
            <UserChip
              key={person.id ?? person.name}
              user={{
                id: person.id ?? person.name,
                name: person.name,
                avatar_url: person.avatar_url,
              }}
              to={person.id ? candidateHref(person.id, jobId) : undefined}
              className="rounded-pill bg-surface-2 py-0.5 pr-2.5 pl-0.5"
            />
          ))}
        </div>
      )
    }
    case 'candidate_contact': {
      const channel = metaString(meta, 'channel')
      const outcome = metaString(meta, 'outcome')
      const direction = metaString(meta, 'direction')
      const nextAction = metaString(meta, 'next_action')
      const nextAt = metaString(meta, 'next_action_at')
      const Icon = channel ? CHANNEL_ICONS[channel] : undefined
      if (!channel && !outcome && !nextAction) return null
      return (
        <div className={wrap}>
          {channel && (
            <Pill>
              {Icon && <Icon aria-hidden="true" className="size-3" />}
              {humanise(channel)}
              {direction && <span className="text-ink-subtle">· {humanise(direction)}</span>}
            </Pill>
          )}
          {outcome && <Pill className="bg-info-soft text-info">Outcome: {humanise(outcome)}</Pill>}
          {nextAction && (
            <span className="text-small text-ink-muted">
              Next step: <span className="text-ink">{nextAction}</span>
              {nextAt && <span className="text-ink-subtle"> · {formatDateTime(nextAt)}</span>}
            </span>
          )}
        </div>
      )
    }
    case 'interview': {
      const round = metaString(meta, 'round')
      const interviewer = metaPerson(meta, 'interviewer')
      const scheduledAt = metaString(meta, 'scheduled_at')
      const mode = metaString(meta, 'mode')
      const link = metaString(meta, 'meeting_link')
      if (!round && !interviewer && !scheduledAt) return null
      return (
        <div className={wrap}>
          {round && (
            <Pill className="bg-info-soft text-info">
              {humanise(round)}
              {mode && <span className="opacity-80">· {humanise(mode)}</span>}
            </Pill>
          )}
          {interviewer && (
            <span className="inline-flex items-center gap-1 text-small text-ink-muted">
              Interviewer:
              <UserChip
                user={{
                  id: interviewer.id ?? interviewer.name,
                  name: interviewer.name,
                  avatar_url: interviewer.avatar_url,
                }}
              />
            </span>
          )}
          {scheduledAt && (
            <Pill>
              <CalendarClockIcon aria-hidden="true" className="size-3" />
              {formatDateTime(scheduledAt)}
            </Pill>
          )}
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-5 items-center gap-1 text-caption font-medium text-primary hover:underline"
            >
              Join link
              <ExternalLinkIcon aria-hidden="true" className="size-3" />
            </a>
          )}
        </div>
      )
    }
    case 'interview_feedback': {
      const score = metaNumber(meta, 'score')
      const recommendation = metaString(meta, 'recommendation')
      if (score === null && !recommendation) return null
      return (
        <div className={wrap}>
          {score !== null && (
            <Pill className="bg-primary-soft font-medium text-primary tabular-nums">
              Score {score}/10
            </Pill>
          )}
          {recommendation && (
            <Pill className={RECOMMENDATION_CLASS[recommendation] ?? ''}>
              {humanise(recommendation)}
            </Pill>
          )}
        </div>
      )
    }
    case 'offer': {
      const designation = metaString(meta, 'designation')
      const ctc = metaNumber(meta, 'annual_ctc')
      const joining = metaString(meta, 'joining_date')
      if (!designation && ctc === null && !joining) return null
      return (
        <div className={wrap}>
          {designation && <Pill>{designation}</Pill>}
          {ctc !== null && (
            <Pill className="bg-warning-soft font-medium text-warning tabular-nums">
              {formatCurrencyINR(ctc)} / yr
            </Pill>
          )}
          {joining && (
            <span className="text-small text-ink-muted">Joining {formatDate(joining)}</span>
          )}
        </div>
      )
    }
    case 'onboarding': {
      const done = metaNumber(meta, 'checklist_done')
      const total = metaNumber(meta, 'checklist_total')
      const buddy = metaPerson(meta, 'buddy')
      const start = metaString(meta, 'start_date')
      if (done === null && !buddy && !start) return null
      return (
        <div className={wrap}>
          {done !== null && total !== null && (
            <Pill className="bg-success-soft font-medium text-success tabular-nums">
              {done}/{total} checklist
            </Pill>
          )}
          {start && <span className="text-small text-ink-muted">Starts {formatDate(start)}</span>}
          {buddy && (
            <span className="inline-flex items-center gap-1 text-small text-ink-muted">
              Buddy:
              <UserChip
                user={{
                  id: buddy.id ?? buddy.name,
                  name: buddy.name,
                  avatar_url: buddy.avatar_url,
                }}
              />
            </span>
          )}
        </div>
      )
    }
    default:
      // candidate_selected and decision: the status move and reason are in TimelineChanges.
      return null
  }
}
