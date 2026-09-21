import {
  BellIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  HouseIcon,
  LayoutDashboardIcon,
  MailsIcon,
  UserSearchIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Match the exact path only; the homepage lives at "/" and would otherwise match everything. */
  end?: boolean
}

/**
 * Sidebar order (Enhancement.md 2): Homepage, Job Descriptions, Search Candidates,
 * Interviews, Candidates, Email Templates, Dashboard, Notifications.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Homepage', icon: HouseIcon, end: true },
  { to: '/jobs', label: 'Job Descriptions', icon: BriefcaseIcon },
  { to: '/search', label: 'Search Candidates', icon: UserSearchIcon },
  { to: '/interviews', label: 'Interviews', icon: CalendarClockIcon },
  { to: '/candidates', label: 'Candidates', icon: UsersIcon },
  { to: '/templates', label: 'Email Templates', icon: MailsIcon },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
  { to: '/notifications', label: 'Notifications', icon: BellIcon },
]

export const SIDEBAR_WIDTH_EXPANDED = 248
export const SIDEBAR_WIDTH_COLLAPSED = 64
export const TOPBAR_HEIGHT = 56
