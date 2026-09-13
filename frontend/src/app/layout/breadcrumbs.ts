import type { Crumb } from '@/lib/ui-store'

/** Labels for the fixed route segments in plan.md 7.1; anything else is a record id. */
const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  jobs: 'Job Descriptions',
  search: 'Search Candidates',
  candidates: 'Candidates',
  interviews: 'Interviews',
  notifications: 'Notifications',
  settings: 'Settings',
  new: 'New',
  edit: 'Edit',
}

/**
 * Breadcrumbs from the URL alone, used by the TopBar until a page publishes
 * richer ones (a JD title, a candidate name) through `PageHeader`.
 */
export function deriveBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split('?')[0].split('/').filter(Boolean)
  return segments.map((segment, index) => {
    const label = SEGMENT_LABELS[segment] ?? 'Details'
    const isLast = index === segments.length - 1
    return isLast ? { label } : { label, to: `/${segments.slice(0, index + 1).join('/')}` }
  })
}
