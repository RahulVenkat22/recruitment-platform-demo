import {
  BellIcon,
  BriefcaseIcon,
  CalendarClockIcon,
  HouseIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  MailsIcon,
  UserSearchIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { HIGH_LEVEL_ROLES } from '@/features/jobs/job-permissions'
import type { SessionUser, UserRole } from '@/types/domain'

export type NavSection = 'main' | 'recruiting' | 'general'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  section: NavSection
  /** Match the exact path only; the homepage lives at "/" and would otherwise match everything. */
  end?: boolean
  /** Only these roles get the item; everyone gets it when unset. */
  roles?: readonly UserRole[]
}

/** The sidebar's groups, in order; a group the user has nothing in is not shown. */
export const NAV_SECTIONS: readonly { key: NavSection; label: string }[] = [
  { key: 'main', label: 'Workspace' },
  { key: 'recruiting', label: 'Recruiting' },
  { key: 'general', label: 'Stay connected' },
]

/**
 * Sidebar items (Enhancement.md 2) in their sections: Homepage and Dashboard up top,
 * the recruiting flow in the middle, Notifications and Support at the end.
 */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Homepage', icon: HouseIcon, section: 'main', end: true },
  {
    to: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboardIcon,
    section: 'main',
    roles: HIGH_LEVEL_ROLES,
  },
  { to: '/jobs', label: 'Job Descriptions', icon: BriefcaseIcon, section: 'recruiting' },
  { to: '/search', label: 'Search Candidates', icon: UserSearchIcon, section: 'recruiting' },
  { to: '/interviews', label: 'Interviews', icon: CalendarClockIcon, section: 'recruiting' },
  { to: '/candidates', label: 'Candidates', icon: UsersIcon, section: 'recruiting' },
  { to: '/templates', label: 'Email Templates', icon: MailsIcon, section: 'recruiting' },
  { to: '/notifications', label: 'Notifications', icon: BellIcon, section: 'general' },
  { to: '/support', label: 'Support', icon: LifeBuoyIcon, section: 'general' },
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
