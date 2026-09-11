import {
  BellIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  LayoutDashboardIcon,
  UserSearchIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
}

/** Sidebar order per plan.md 8.4. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboardIcon },
  { to: '/jobs', label: 'Job Descriptions', icon: BriefcaseIcon },
  { to: '/search', label: 'Search Candidates', icon: UserSearchIcon },
  { to: '/candidates', label: 'Candidates', icon: UsersIcon },
  { to: '/interviews', label: 'Interviews', icon: CalendarClockIcon },
  { to: '/notifications', label: 'Notifications', icon: BellIcon },
]

export const SIDEBAR_WIDTH_EXPANDED = 248
export const SIDEBAR_WIDTH_COLLAPSED = 64
export const TOPBAR_HEIGHT = 56
