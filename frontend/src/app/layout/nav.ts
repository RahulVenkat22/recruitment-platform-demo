import {
  BellIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  HouseIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MailsIcon,
  ShieldCheckIcon,
  UserSearchIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { HIGH_LEVEL_ROLES } from '@/features/jobs/job-permissions'
import type { SessionUser, UserRole } from '@/types/domain'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match the exact path only; the homepage lives at "/" and would otherwise match everything. */
  end?: boolean
  /** Only these roles get the item; everyone gets it when unset. */
  roles?: readonly UserRole[]
}

/** Sidebar items in display order. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Homepage', icon: HouseIcon, end: true },
  { to: '/jobs', label: 'Job Descriptions', icon: BriefcaseIcon },
  { to: '/search', label: 'Search Candidates', icon: UserSearchIcon },
  { to: '/interviews', label: 'Interviews', icon: CalendarClockIcon },
  { to: '/candidates', label: 'Candidates', icon: UsersIcon },
  { to: '/templates', label: 'Email Templates', icon: MailsIcon },
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboardIcon,
    roles: HIGH_LEVEL_ROLES,
  },
  { to: '/notifications', label: 'Notifications', icon: BellIcon },
  { to: '/security', label: 'Security & Trust', icon: ShieldCheckIcon },
  { to: '/support', label: 'Support', icon: LifeBuoyIcon },
]

/** The items this user gets: the dashboard is HR's view, so interviewers and employees never see it. */
export function navItemsFor(user: SessionUser | null): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.roles || (user !== null && item.roles.includes(user.role)),
  )
}

export const SIDEBAR_WIDTH_EXPANDED = 248
export const SIDEBAR_WIDTH_COLLAPSED = 72
export const TOPBAR_HEIGHT = 72
