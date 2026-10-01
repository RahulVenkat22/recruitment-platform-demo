import type { ReactNode } from 'react'
import { TimerIcon } from 'lucide-react'

export function TatSummary({
  description,
  metrics,
  children,
}: {
  description: string
  metrics: { label: string; value: string }[]
  children?: ReactNode
}) {
  return (
    <section
      className="rounded-card border border-line bg-surface p-5 shadow-card"
      aria-label="Turnaround time"
    >
      <h3 className="flex items-center gap-2 text-body font-medium text-ink">
        <TimerIcon className="size-4 text-ink-muted" aria-hidden="true" />
        Turnaround time (TAT)
      </h3>
      <p className="mt-1 text-small text-ink-muted">{description}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map(({ label, value }) => (
          <div key={label} className="rounded-control bg-surface-2 px-3 py-3">
            <dt className="text-caption text-ink-muted">{label}</dt>
            <dd className="mt-1 text-lg font-medium text-ink tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  )
}
