import {
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
import { SourceBadge } from '@/components/shared/SourceBadge'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { FALLBACK_STATUS, humanise } from '@/lib/enums'
import { formatCurrencyINR, formatDate, formatDateTime } from '@/lib/format'
import {
  humaniseField,
  metaNumber,
  metaPeople,
  metaPerson,
  metaString,
  metaStrings,
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

function statusPill(key: string) {
  return key in FALLBACK_STATUS ? (
    <StatusBadge status={key} dot />
  ) : (
    <Pill className="bg-primary-soft text-primary">{humanise(key)}</Pill>
  )
}

/** The per-category detail block under a timeline title (plan.md 8.4 "TimelineItem details by category"). */
export function TimelineItemDetails({ item, jobId }: TimelineItemDetailsProps) {
  const meta = (item.metadata ?? {}) as Metadata
  const wrap = 'mt-1.5 flex flex-wrap items-center gap-1.5'

  switch (item.category) {
    case 'job_description': {
      const changed = metaStrings(meta, 'changed_fields')
      const people = metaPeople(meta, 'participants')
      const version = metaNumber(meta, 'version')
      if (!changed.length && !people.length && !(version && item.event_type === 'jd.updated'))
        return null
      return (
        <div className={wrap}>
          {changed.map((field) => (
            <Pill key={field}>{humaniseField(field)}</Pill>
          ))}
          {people.map((person) => (
            <Pill key={person.id ?? person.name}>
              {person.name}
              {person.role && <span className="text-ink-subtle">· {humanise(person.role)}</span>}
            </Pill>
          ))}
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
      if (!sources.length && found === null) return null
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
            </Pill>
          )}
          {outcome && <Pill className="bg-info-soft text-info">Status: {humanise(outcome)}</Pill>}
          {nextAction && (
            <span className="text-small text-ink-muted">
              Next: <span className="text-ink">{nextAction}</span>
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
      const link = metaString(meta, 'meeting_link')
      if (!round && !interviewer && !scheduledAt) return null
      return (
        <div className={wrap}>
          {round && <Pill className="bg-info-soft text-info">{humanise(round)}</Pill>}
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
    case 'candidate_selected': {
      const to = metaString(meta, 'to') ?? metaString(meta, 'status')
      if (!to) return null
      return <div className={wrap}>{statusPill(to)}</div>
    }
    case 'offer': {
      const to = metaString(meta, 'to')
      const designation = metaString(meta, 'designation')
      const ctc = metaNumber(meta, 'annual_ctc')
      const joining = metaString(meta, 'joining_date')
      if (!to && !designation && ctc === null) return null
      return (
        <div className={wrap}>
          {to && statusPill(to)}
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
      const to = metaString(meta, 'to')
      const done = metaNumber(meta, 'checklist_done')
      const total = metaNumber(meta, 'checklist_total')
      const buddy = metaPerson(meta, 'buddy')
      if (!to && done === null && !buddy) return null
      return (
        <div className={wrap}>
          {to && statusPill(to)}
          {done !== null && total !== null && (
            <Pill className="bg-success-soft font-medium text-success tabular-nums">
              {done}/{total} checklist
            </Pill>
          )}
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
    case 'decision': {
      const reason = metaString(meta, 'reason')
      const to = metaString(meta, 'to')
      if (!reason && !to) return null
      return (
        <div className={wrap}>
          {to && statusPill(to)}
          {reason && <span className="text-small text-ink-muted">Reason: {reason}</span>}
        </div>
      )
    }
    default:
      return null
  }
}
