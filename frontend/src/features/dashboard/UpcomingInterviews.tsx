import { CalendarClockIcon, ExternalLinkIcon } from 'lucide-react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/shared/EmptyState'
import { StaggerItem } from '@/components/shared/Stagger'
import { UserChip } from '@/components/shared/UserChip'
import { Button } from '@/components/ui/button'
import { canJoin, candidateHrefFor } from '@/features/interviews/interview-utils'
import { formatWhen } from '@/lib/format'
import { personFromUser, type Interview } from '@/types/domain'

/** The next few interviews with a join link once the meeting is near (plan.md 9.3). */
export function UpcomingInterviews({ interviews }: { interviews: readonly Interview[] }) {
  if (interviews.length === 0) {
    return (
      <EmptyState
        size="sm"
        icon={CalendarClockIcon}
        title="Nothing scheduled"
        description="Interviews appear here as soon as they are booked."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/interviews">All interviews</Link>
          </Button>
        }
      />
    )
  }
  return (
    <ul className="divide-y divide-line" aria-label="Upcoming interviews">
      {interviews.map((interview, index) => (
        <li key={interview.id} data-slot="upcoming-interview">
          <StaggerItem index={index} className="flex min-w-0 items-center gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-small text-ink">
                <span className="font-medium">{formatWhen(interview.scheduled_at)}</span>
                <span className="text-ink-subtle"> · {interview.round_label} · </span>
                <Link to={candidateHrefFor(interview)} className="font-medium hover:underline">
                  {interview.application.candidate.full_name}
                </Link>
              </p>
              <div className="mt-0.5 flex min-w-0 items-center gap-2 text-caption text-ink-subtle">
                <UserChip user={personFromUser(interview.interviewer)} />
                <span className="min-w-0 truncate">· {interview.application.job.title}</span>
              </div>
            </div>
            {canJoin(interview) && (
              <Button asChild size="xs" variant="outline">
                <a href={interview.meeting_link ?? '#'} target="_blank" rel="noreferrer">
                  Join <ExternalLinkIcon data-icon="inline-end" aria-hidden="true" />
                </a>
              </Button>
            )}
          </StaggerItem>
        </li>
      ))}
    </ul>
  )
}
