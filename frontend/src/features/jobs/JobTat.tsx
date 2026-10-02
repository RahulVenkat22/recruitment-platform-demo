import { TatSummary } from '@/features/tat/TatSummary'
import { formatTat } from '@/features/tat/format-tat'
import { formatDateTime } from '@/lib/format'
import type { JobDetail } from '@/types/domain'

export function JobTat({ tat }: { tat: JobDetail['tat'] }) {
  const elapsedLabel =
    tat.state === 'filled'
      ? 'All openings filled'
      : tat.state === 'closed'
        ? 'Elapsed at closure'
        : 'Elapsed since opening'
  const descriptions = {
    not_started: 'TAT starts when this job is published.',
    in_progress: 'Hiring in progress. Measured from publication to completed onboarding.',
    on_hold: 'This job is on hold. Calendar time continues to include the hold.',
    filled: 'All current openings filled. The clock stopped at the final required hire.',
    closed: 'Recruitment closed before all current openings were filled.',
  }
  return (
    <TatSummary
      description={descriptions[tat.state]}
      metrics={[
        { label: elapsedLabel, value: formatTat(tat.elapsed_seconds) },
        { label: 'First hire TAT', value: formatTat(tat.first_hire_seconds) },
        { label: 'Average hire TAT', value: formatTat(tat.average_hire_seconds) },
        { label: 'Completed hires / openings', value: `${tat.hires} / ${tat.openings}` },
      ]}
    >
      <p className="mt-3 text-caption text-ink-subtle">
        Calendar time, including holds and weekends. A hire means completed onboarding.
        {tat.started_at && <> Opened {formatDateTime(tat.started_at)}.</>} As of{' '}
        {formatDateTime(tat.as_of)}. A dash means no recorded milestone.
      </p>
    </TatSummary>
  )
}
