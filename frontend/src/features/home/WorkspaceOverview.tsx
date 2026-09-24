import {
  ArrowUpRightIcon,
  BriefcaseBusinessIcon,
  CalendarDaysIcon,
  CircleCheckIcon,
  FilePenLineIcon,
  PauseCircleIcon,
  SparklesIcon,
  UploadCloudIcon,
  UserSearchIcon,
} from 'lucide-react'
import { Link } from 'react-router'
import { AnimatedNumber } from '@/components/shared/AnimatedNumber'
import { StaggerItem } from '@/components/shared/Stagger'
import { TalentOrbit } from '@/components/shared/TalentOrbit'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { JobFacets } from '@/types/domain'

const METRICS = [
  {
    key: 'open',
    label: 'Open roles',
    description: 'Ready for the right people',
    icon: BriefcaseBusinessIcon,
    tone: 'bg-[#e8f4ef] text-[#18775e]',
  },
  {
    key: 'draft',
    label: 'In the making',
    description: 'Drafts to bring to life',
    icon: FilePenLineIcon,
    tone: 'bg-[#eef0fc] text-[#6874be]',
  },
  {
    key: 'on_hold',
    label: 'On hold',
    description: 'Waiting for the next step',
    icon: PauseCircleIcon,
    tone: 'bg-[#fff4e4] text-[#a47329]',
  },
  {
    key: 'closed',
    label: 'Closed roles',
    description: 'Completed recruitment',
    icon: CircleCheckIcon,
    tone: 'bg-[#eaf3fa] text-[#367fa2]',
  },
]

export function WorkspaceOverview({
  facets,
  loading,
  failed,
  canCreate,
}: {
  facets?: JobFacets
  loading: boolean
  failed: boolean
  canCreate: boolean
}) {
  const actions = [
    {
      to: '/search',
      label: 'Discover your next hire',
      copy: 'Let AI connect skills to opportunity.',
      icon: UserSearchIcon,
      tone: 'bg-primary-soft text-primary',
    },
    {
      to: '/interviews',
      label: 'Make time for talent',
      copy: 'Keep every conversation moving.',
      icon: CalendarDaysIcon,
      tone: 'bg-[#eef0fc] text-[#6874be]',
    },
    ...(canCreate
      ? [
          {
            to: '/candidates/upload',
            label: 'Grow your talent pool',
            copy: 'Turn resumes into living profiles.',
            icon: UploadCloudIcon,
            tone: 'bg-[#fff4e4] text-[#a47329]',
          },
        ]
      : [
          {
            to: '/candidates',
            label: 'Meet your candidates',
            copy: 'Explore the people in your pipeline.',
            icon: UserSearchIcon,
            tone: 'bg-[#fff4e4] text-[#a47329]',
          },
        ]),
  ]
  return (
    <div className="mb-8 space-y-5">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        <section
          className="hero-panel flex min-h-[200px] items-center justify-between gap-4 px-7 py-5 sm:px-8"
          aria-labelledby="workspace-welcome"
        >
          <div className="relative z-10 max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-medium tracking-[0.09em] text-[#dbe9a4] uppercase">
              <SparklesIcon aria-hidden="true" className="size-3" /> Your talent advantage
            </span>
            <h2
              id="workspace-welcome"
              className="mt-3 text-[24px]/[1.2] font-semibold tracking-[-0.04em] sm:text-[28px]"
            >
              Great teams start with
              <br />
              <span className="text-[#dceba0]">a little possibility.</span>
            </h2>
            <p className="mt-3 max-w-md text-[13px]/[21px] text-[#bfd1d7]">
              Bring the right people and the right roles together. Your next great hire is a
              conversation away.
            </p>
          </div>
          <TalentOrbit className="home-orbit mr-4 shrink-0 max-xl:hidden" />
        </section>
        <div className="grid grid-cols-3 gap-3 xl:grid-cols-1">
          {actions.map(({ to, label, copy, icon: Icon, tone }, index) => (
            <StaggerItem key={to} index={index + 3}>
              <Link
                to={to}
                className="quick-link flex h-full items-center gap-3 max-xl:flex-col max-xl:items-start rounded-2xl border border-line bg-surface/80 p-3.5"
              >
                <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)}>
                  <Icon aria-hidden="true" className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-ink">{label}</span>
                  <span className="mt-1 block text-[11px] text-ink-subtle max-xl:hidden">
                    {copy}
                  </span>
                </span>
                <ArrowUpRightIcon
                  aria-hidden="true"
                  className="quick-arrow size-4 shrink-0 text-ink-subtle max-xl:hidden"
                />
              </Link>
            </StaggerItem>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-small font-semibold text-ink">Recruitment at a glance</h2>
          <span className="text-[11px] text-ink-subtle">All accessible roles</span>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {METRICS.map(({ key, label, description, icon: Icon, tone }, index) => (
            <StaggerItem key={key} index={index}>
              <Link
                to={`/jobs?status=${key}`}
                className="quick-link group flex h-full flex-col rounded-card border border-line bg-surface p-4 shadow-card"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className={cn('grid size-8 place-items-center rounded-xl', tone)}>
                      <Icon aria-hidden="true" className="size-4" strokeWidth={1.7} />
                    </span>
                    <span className="text-[12px] font-medium text-ink-muted">{label}</span>
                  </span>
                  <ArrowUpRightIcon
                    aria-hidden="true"
                    className="quick-arrow size-3.5 text-ink-subtle/60"
                  />
                </span>
                <span className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-heading text-[30px]/[1.2] font-semibold tracking-[-0.04em] text-ink tabular-nums">
                    {loading ? (
                      <Skeleton className="h-9 w-12" />
                    ) : failed ? (
                      '—'
                    ) : (
                      <AnimatedNumber
                        value={facets?.statuses.find((status) => status.key === key)?.count ?? 0}
                      />
                    )}
                  </span>
                  <span className="text-[10px] text-ink-subtle">
                    {failed ? 'Temporarily unavailable' : description}
                  </span>
                </span>
              </Link>
            </StaggerItem>
          ))}
        </div>
      </div>
    </div>
  )
}
