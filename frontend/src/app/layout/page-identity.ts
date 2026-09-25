import {
  BellIcon,
  BriefcaseBusinessIcon,
  CalendarDaysIcon,
  ChartNoAxesCombinedIcon,
  HouseIcon,
  LifeBuoyIcon,
  MailIcon,
  Settings2Icon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from 'lucide-react'

const identity = {
  dashboard: { icon: ChartNoAxesCombinedIcon, label: 'Insights & performance' },
  jobs: { icon: BriefcaseBusinessIcon, label: 'Build your next team' },
  search: { icon: SparklesIcon, label: 'Intelligence meets opportunity' },
  candidates: { icon: UsersIcon, label: 'People & possibilities' },
  interviews: { icon: CalendarDaysIcon, label: 'Make meaningful connections' },
  templates: { icon: MailIcon, label: 'Conversations that count' },
  notifications: { icon: BellIcon, label: 'Your workspace, in the loop' },
  security: { icon: ShieldCheckIcon, label: 'Built on trust' },
  support: { icon: LifeBuoyIcon, label: 'Here to help you move forward' },
  settings: { icon: Settings2Icon, label: 'Make this space yours' },
}

export function pageIdentity(pathname: string) {
  return (
    identity[pathname.split('/')[1] as keyof typeof identity] ?? {
      icon: HouseIcon,
      label: 'Your hiring overview',
    }
  )
}
