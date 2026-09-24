import type { ReactNode } from 'react'
import { RichText } from '@/components/shared/RichText'
import { SkillChips } from '@/components/shared/SkillChips'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import {
  formatExperience,
  formatLocation,
  formatSalaryRange,
  skillChips,
  splitLines,
} from '@/features/jobs/job-utils'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { JobSnapshot, Person } from '@/types/domain'

export type OverviewContent = JobSnapshot & {
  required_skill_names?: readonly string[]
  preferred_skill_names?: readonly string[]
}

export interface JobOverviewProps {
  content: OverviewContent
  status?: string
  createdBy?: Person | null
  createdAt?: string | null
  updatedAt?: string | null
  /** Rendered in the snapshot card under "People involved" (an AvatarGroup, usually). */
  people?: ReactNode
  className?: string
}

function Lines({ text, emptyLabel }: { text: string; emptyLabel: string }) {
  const lines = splitLines(text)
  if (lines.length === 0) return <p className="text-small text-ink-subtle">{emptyLabel}</p>
  return (
    <ul className="list-disc space-y-1 pl-5 text-body text-ink marker:text-ink-subtle">
      {lines.map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ul>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase">
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-small max-sm:grid-cols-1 max-sm:gap-0.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  )
}

/** plan.md 9.6 Overview: "About the role" (2/3) beside the "Snapshot" card (1/3). Shared with previews and versions. */
export function JobOverview({
  content,
  status,
  createdBy,
  createdAt,
  updatedAt,
  people,
  className,
}: JobOverviewProps) {
  const salary = formatSalaryRange(
    content.salary_min,
    content.salary_max,
    content.salary_currency,
    {
      compact: false,
    },
  )
  return (
    <div className={cn('grid gap-5 lg:grid-cols-3', className)}>
      <div className="space-y-6 rounded-card border border-line bg-surface p-5 shadow-card lg:col-span-2 md:p-6">
        <Section title="About the role">
          <RichText text={content.description} emptyLabel="No description written yet." />
        </Section>
        <Section title="Responsibilities">
          <Lines text={content.responsibilities} emptyLabel="No responsibilities listed." />
        </Section>
        <Section title="Qualifications">
          <Lines text={content.qualifications} emptyLabel="No qualifications listed." />
        </Section>
        {content.additional_requirements.trim() && (
          <Section title="Additional requirements">
            <Lines text={content.additional_requirements} emptyLabel="" />
          </Section>
        )}
        <Section title="Education">
          <Lines
            text={content.education_requirements}
            emptyLabel="No educational requirement specified."
          />
        </Section>
        <div className="grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <Section title="Required skills">
            <SkillChips
              size="md"
              skills={skillChips(content.required_skills, content.required_skill_names)}
              emptyLabel="No required skills."
            />
          </Section>
          <Section title="Preferred skills">
            <SkillChips
              size="md"
              skills={skillChips(content.preferred_skills, content.preferred_skill_names)}
              emptyLabel="No preferred skills."
            />
          </Section>
        </div>
      </div>

      <aside className="rounded-card border border-line bg-surface p-5 shadow-card">
        <h3 className="text-caption font-medium tracking-[0.08em] text-ink-subtle uppercase">
          Snapshot
        </h3>
        <dl className="mt-2 divide-y divide-line">
          <Row label="Department">{content.department || '—'}</Row>
          <Row label="Location">{formatLocation(content.location, content.work_mode) || '—'}</Row>
          <Row label="Experience">
            {formatExperience(content.experience_min_years, content.experience_max_years, 'years')}
          </Row>
          <Row label="Salary">{salary || 'Not specified'}</Row>
          <Row label="Openings">{content.openings}</Row>
          <Row label="Domain">{content.domain ? content.domain : '—'}</Row>
          {status && (
            <Row label="Status">
              <StatusBadge status={status} kind="jd_status" dot />
            </Row>
          )}
          {createdBy && (
            <Row label="Created by">
              <UserChip user={createdBy} />
            </Row>
          )}
          {createdAt && <Row label="Created">{formatDateTime(createdAt)}</Row>}
          {updatedAt && <Row label="Last modified">{formatDateTime(updatedAt)}</Row>}
          {people && <Row label="People involved">{people}</Row>}
        </dl>
      </aside>
    </div>
  )
}
