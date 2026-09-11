import { PageHeader } from '@/components/shared/PageHeader'
import type { Crumb } from '@/lib/ui-store'

interface PhasePlaceholderProps {
  title: string
  /** Build phase from plan.md section 12 that delivers this page. */
  phase: number
  subtitle?: string
  breadcrumbs?: Crumb[]
}

/** Stand-in page body used until the real page lands in its build phase. */
export function PhasePlaceholder({ title, phase, subtitle, breadcrumbs }: PhasePlaceholderProps) {
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={breadcrumbs ?? [{ label: title }]}
      />
      <p className="text-ink-muted">Coming in phase {phase}.</p>
    </>
  )
}
