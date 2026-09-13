import { ExternalLinkIcon, FileTextIcon, CodeIcon, LockIcon } from 'lucide-react'
import { RichText } from '@/components/shared/RichText'
import { formatCtc, groupSkills, isMasked } from '@/features/candidates/candidate-utils'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { CandidateDetail } from '@/types/domain'

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

function Dots({ level }: { level: number }) {
  return (
    <span aria-label={`${level} of 5`} className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((dot) => (
        <span
          key={dot}
          aria-hidden="true"
          className={cn('size-1.5 rounded-full', dot <= level ? 'bg-primary' : 'bg-surface-3')}
        />
      ))}
    </span>
  )
}

function Row({
  label,
  value,
  masked = false,
}: {
  label: string
  value: React.ReactNode
  masked?: boolean
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-1.5 text-small max-sm:grid-cols-1 max-sm:gap-0.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="inline-flex min-w-0 items-center gap-1.5 text-ink">
        <span className="truncate">{value ?? '—'}</span>
        {masked && (
          <LockIcon aria-label="Hidden for your role" className="size-3 shrink-0 text-ink-subtle" />
        )}
      </dd>
    </div>
  )
}

/** plan.md 9.10 Profile tab: summary, experience, education, certifications and resume left; skills, details and links right. */
export function ProfileTab({ candidate }: { candidate: CandidateDetail }) {
  const groups = groupSkills(candidate.skills)
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Card title="Summary">
          <RichText text={candidate.summary} emptyLabel="No summary on file." />
        </Card>
        <Card title="Experience">
          {candidate.experiences.length === 0 ? (
            <p className="text-small text-ink-subtle">No experience listed.</p>
          ) : (
            <ol className="relative space-y-5 border-l border-line pl-5">
              {candidate.experiences.map((experience) => (
                <li key={experience.id} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-primary ring-2 ring-surface"
                  />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium text-ink">{experience.title}</span>
                    <span className="text-ink-muted">at {experience.company}</span>
                    {experience.domain && (
                      <span className="inline-flex h-5 items-center rounded-pill bg-surface-2 px-2 text-caption text-ink-muted">
                        {experience.domain}
                      </span>
                    )}
                  </div>
                  <p className="text-caption text-ink-subtle">
                    {formatDate(experience.start_date)} –{' '}
                    {experience.is_current || !experience.end_date
                      ? 'Present'
                      : formatDate(experience.end_date)}
                  </p>
                  {experience.description && (
                    <p className="mt-1 text-small text-ink-muted">{experience.description}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </Card>
        <div className="grid gap-5 md:grid-cols-2">
          <Card title="Education">
            {candidate.education.length === 0 ? (
              <p className="text-small text-ink-subtle">No education listed.</p>
            ) : (
              <ul className="space-y-3">
                {candidate.education.map((row) => (
                  <li key={row.id}>
                    <p className="font-medium text-ink">
                      {row.degree} {row.field}
                    </p>
                    <p className="text-small text-ink-muted">{row.institution}</p>
                    <p className="text-caption text-ink-subtle">
                      {row.start_year}–{row.end_year}
                      {row.grade ? ` · ${row.grade}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Certifications">
            {candidate.certifications.length === 0 ? (
              <p className="text-small text-ink-subtle">No certifications listed.</p>
            ) : (
              <ul className="space-y-3">
                {candidate.certifications.map((row) => (
                  <li key={row.id}>
                    <p className="font-medium text-ink">{row.name}</p>
                    <p className="text-caption text-ink-subtle">
                      {row.issuer} · {row.issued_year}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Resume">
          {candidate.resume_text ? (
            <>
              <pre className="max-h-80 overflow-y-auto rounded-control bg-surface-2 p-4 font-sans text-small whitespace-pre-wrap text-ink">
                {candidate.resume_text}
              </pre>
              {candidate.resume_url && (
                <a
                  href={candidate.resume_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-small font-medium text-primary hover:underline"
                >
                  <FileTextIcon aria-hidden="true" className="size-4" />
                  Open resume
                  <ExternalLinkIcon aria-hidden="true" className="size-3" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              )}
            </>
          ) : (
            <p className="text-small text-ink-subtle">No resume on file.</p>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        <Card title="Skills">
          {groups.length === 0 ? (
            <p className="text-small text-ink-subtle">No skills listed.</p>
          ) : (
            <div className="space-y-4">
              {groups.map((group) => (
                <div key={group.level}>
                  <p className="mb-1.5 flex items-center justify-between text-caption text-ink-subtle">
                    <span>{group.label}</span>
                    <Dots level={group.level} />
                  </p>
                  <ul className="flex flex-wrap gap-1">
                    {group.skills.map((skill) => (
                      <li
                        key={skill.id}
                        className={cn(
                          'inline-flex h-6 items-center rounded-pill px-2.5 text-[13px]',
                          skill.is_primary
                            ? 'bg-primary-soft text-primary'
                            : 'bg-surface-2 text-ink',
                        )}
                        title={skill.years ? `${skill.years} yrs` : undefined}
                      >
                        {skill.display_name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Details">
          <dl className="divide-y divide-line">
            <Row
              label="Notice period"
              value={
                candidate.notice_period_days === null ? '—' : `${candidate.notice_period_days} days`
              }
            />
            <Row label="Current CTC" value={formatCtc(candidate.current_ctc)} />
            <Row label="Expected CTC" value={formatCtc(candidate.expected_ctc)} />
            <Row label="Location" value={candidate.location || '—'} />
            <Row label="Phone" value={candidate.phone || '—'} masked={isMasked(candidate.phone)} />
            <Row label="Email" value={candidate.email} masked={isMasked(candidate.email)} />
          </dl>
        </Card>
        <Card title="Professional profiles">
          <ul className="space-y-2 text-small">
            {candidate.linkedin_url && (
              <li>
                <a
                  href={candidate.linkedin_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  LinkedIn <ExternalLinkIcon aria-hidden="true" className="size-3" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            )}
            {candidate.github_url && (
              <li>
                <a
                  href={candidate.github_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-primary hover:underline"
                >
                  <CodeIcon aria-hidden="true" className="size-3.5" /> GitHub{' '}
                  <ExternalLinkIcon aria-hidden="true" className="size-3" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            )}
            {!candidate.linkedin_url && !candidate.github_url && (
              <li className="text-ink-subtle">No profiles linked.</li>
            )}
          </ul>
        </Card>
      </div>
    </div>
  )
}
