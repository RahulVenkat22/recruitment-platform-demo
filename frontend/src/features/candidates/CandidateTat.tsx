import { TatSummary } from '@/features/tat/TatSummary'
import { formatTat } from '@/features/tat/format-tat'
import { formatDateTime } from '@/lib/format'
import type { ApplicationDetail } from '@/types/domain'

export function CandidateTat({ application }: { application: ApplicationDetail }) {
  const tat = application.tat
  const hired = application.status === 'onboarded'
  const stopped = tat.finished_at !== null
  const current = tat.stages.find((stage) => stage.is_current)
  return (
    <TatSummary
      description={
        hired
          ? 'Completed at onboarding. Each visit to a stage is shown below.'
          : stopped
            ? 'Clock stopped when this application ended. It resumes if the candidate is reopened.'
            : 'Elapsed calendar time for this candidate on this job, including time on hold.'
      }
      metrics={[
        {
          label: hired
            ? 'Job opening → hire'
            : stopped
              ? 'Job opening → outcome'
              : 'Since job opening',
          value: formatTat(tat.job_elapsed_seconds),
        },
        {
          label: hired ? 'Candidate → hire' : 'Candidate elapsed',
          value: formatTat(tat.elapsed_seconds),
        },
        {
          label: stopped ? 'Outcome' : 'Current stage',
          value: stopped ? application.status_label : formatTat(current?.elapsed_seconds ?? null),
        },
        {
          label: 'Recorded time on hold',
          value: tat.on_hold_seconds === 0 ? '0m' : formatTat(tat.on_hold_seconds),
        },
      ]}
    >
      {!tat.history_complete && (
        <p className="mt-4 rounded-control bg-surface-2 p-3 text-small text-ink-muted">
          Some historical stage changes were not recorded. Those intervals are shown as unrecorded
          stages; their time is included in the total.
        </p>
      )}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-small">
          <caption className="sr-only">Time spent in each candidate stage</caption>
          <thead className="border-b border-line text-caption text-ink-muted">
            <tr>
              <th scope="col" className="pb-2 pr-4 font-medium">
                Stage
              </th>
              <th scope="col" className="pb-2 pr-4 text-right whitespace-nowrap font-medium">
                Time spent
              </th>
              <th scope="col" className="pb-2 pr-4 font-medium">
                Entered
              </th>
              <th scope="col" className="pb-2 pr-4 font-medium">
                Exited
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tat.stages.map((stage, index) => (
              <tr key={`${stage.entered_at}-${index}`}>
                <th scope="row" className="py-3 pr-4 font-medium text-ink">
                  {stage.label}
                  {stage.is_current && !stopped && (
                    <span className="ml-2 text-caption text-primary">Current</span>
                  )}
                </th>
                <td className="py-3 pr-4 text-right whitespace-nowrap text-ink tabular-nums">
                  {formatTat(stage.elapsed_seconds)}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap text-ink-muted">
                  {formatDateTime(stage.entered_at)}
                </td>
                <td className="py-3 pr-4 whitespace-nowrap text-ink-muted">
                  {stage.exited_at ? formatDateTime(stage.exited_at) : 'In progress'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption text-ink-subtle sm:hidden">
        Scroll the table to see entry and exit timestamps.
      </p>
      <p className="mt-3 text-caption text-ink-subtle">
        Includes weekends and holds. Revisited stages appear separately. As of{' '}
        {formatDateTime(tat.as_of)}.
      </p>
    </TatSummary>
  )
}
