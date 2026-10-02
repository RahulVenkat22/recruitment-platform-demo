import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BriefcaseBusinessIcon,
  CalendarDaysIcon,
  CircleCheckIcon,
  FilePenLineIcon,
  PauseCircleIcon,
  SparklesIcon,
  UploadCloudIcon,
  UsersIcon,
  UserSearchIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { StaggerItem } from '@/components/shared/Stagger'
import { Skeleton } from '@/components/ui/skeleton'
import type { JobFacets } from '@/types/domain'

const METRICS = [
  {
    key: 'open',
    label: 'Open roles',
    description: 'Actively recruiting',
    icon: BriefcaseBusinessIcon,
    tone: 'blue',
  },
  {
    key: 'draft',
    label: 'Draft roles',
    description: 'Ready for your next step',
    icon: FilePenLineIcon,
    tone: 'violet',
  },
  {
    key: 'on_hold',
    label: 'On hold',
    description: 'Paused for now',
    icon: PauseCircleIcon,
    tone: 'amber',
  },
  {
    key: 'closed',
    label: 'Closed roles',
    description: 'Recruitment completed',
    icon: CircleCheckIcon,
    tone: 'slate',
  },
]

interface OverviewProps {
  facets?: JobFacets
  loading: boolean
  failed: boolean
  onSelectStatus: (status: string) => void
}

export function WorkspaceOverview({
  facets,
  loading,
  failed,
  selectedStatuses,
  onSelectStatus,
}: OverviewProps & { selectedStatuses: string[] }) {
  return (
    <section className="home-overview" aria-label="Recruitment at a glance">
      <div className="home-section-caption">
        <h2>Hiring at a glance</h2>
        <span>Across your accessible roles</span>
      </div>
      <div className="home-metrics">
        {METRICS.map(({ key, label, description, icon: Icon, tone }, index) => {
          const count = facets?.statuses.find((status) => status.key === key)?.count ?? 0
          const active = selectedStatuses.length === 1 && selectedStatuses[0] === key
          return (
            <StaggerItem key={key} index={index}>
              <button
                type="button"
                className="home-metric"
                data-tone={tone}
                aria-pressed={active}
                aria-label={`Show ${label.toLowerCase()}`}
                disabled={loading || failed}
                onClick={() => onSelectStatus(key)}
              >
                <span className="home-metric-top">
                  <span>{label}</span>
                  <span className="home-metric-icon">
                    <Icon size={19} aria-hidden="true" />
                  </span>
                </span>
                <span className="home-metric-value">
                  {loading ? (
                    <Skeleton className="h-10 w-12" />
                  ) : failed ? (
                    '—'
                  ) : (
                    <AnimatedNumber value={count} />
                  )}
                </span>
                <span className="home-metric-bottom">
                  <span className="home-metric-description">
                    <span className="home-metric-dot" aria-hidden="true" />
                    {failed ? 'Temporarily unavailable' : description}
                  </span>
                  <ArrowUpRightIcon size={15} aria-hidden="true" />
                </span>
              </button>
            </StaggerItem>
          )
        })}
      </div>
    </section>
  )
}

export function WorkspaceQuickActions({
  facets,
  loading,
  failed,
  canCreate,
  onSelectStatus,
}: OverviewProps & { canCreate: boolean }) {
  const drafts = facets?.statuses.find((status) => status.key === 'draft')?.count ?? 0
  const showDrafts = !loading && !failed && drafts > 0
  const shortcuts = [
    {
      label: 'Find candidates',
      hint: 'Search for the right skills',
      to: '/search',
      icon: UserSearchIcon,
      tone: 'blue',
    },
    {
      label: 'View interviews',
      hint: 'Keep conversations moving',
      to: '/interviews',
      icon: CalendarDaysIcon,
      tone: 'violet',
    },
    {
      label: canCreate ? 'Upload resumes' : 'Explore candidates',
      hint: canCreate ? 'Add people to your talent pool' : 'Get to know your talent pool',
      to: canCreate ? '/candidates/upload' : '/candidates',
      icon: canCreate ? UploadCloudIcon : UsersIcon,
      tone: 'amber',
    },
  ]

  return (
    <aside className="home-side-panel" aria-label="Hiring shortcuts">
      <section className="home-quick-actions" aria-labelledby="home-actions-heading">
        <div className="home-panel-heading">
          <h2 id="home-actions-heading">Quick actions</h2>
          <ArrowUpRightIcon size={16} aria-hidden="true" />
        </div>
        <p>A little less searching. A little more doing.</p>
        <nav aria-label="Quick actions">
          {shortcuts.map(({ label, hint, to, icon: Icon, tone }) => (
            <Link key={to} to={to} className="home-quick-action" data-tone={tone}>
              <span className="home-quick-action-icon">
                <Icon size={19} aria-hidden="true" />
              </span>
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
              <ArrowRightIcon className="home-quick-action-arrow" size={15} aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </section>

      <section className="home-next-step" aria-labelledby="home-next-heading">
        <div className="home-next-label">
          <SparklesIcon size={15} aria-hidden="true" />
          YOUR NEXT STEP
        </div>
        <h2 id="home-next-heading">
          {showDrafts
            ? `${drafts} ${drafts === 1 ? 'role ready' : 'roles ready'} to take shape.`
            : 'The right person starts with a search.'}
        </h2>
        <p>
          {showDrafts
            ? 'Pick up a draft, refine the details, and move your next hire forward.'
            : 'Describe the skills you need and discover candidates for your team.'}
        </p>
        {showDrafts ? (
          <button type="button" onClick={() => onSelectStatus('draft')}>
            Review draft roles <ArrowRightIcon size={15} aria-hidden="true" />
          </button>
        ) : (
          <Link to="/search">
            Explore talent <ArrowRightIcon size={15} aria-hidden="true" />
          </Link>
        )}
      </section>

      <Link to="/jobs" className="home-all-jobs-link">
        <BriefcaseBusinessIcon size={15} aria-hidden="true" />
        All job descriptions
        <ArrowUpRightIcon size={15} aria-hidden="true" />
      </Link>
    </aside>
  )
}
