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

/** What a detail page under each section is called when it is the page you came from. */
const DETAIL_LABELS: Record<string, string> = {
  jobs: 'Job description',
  candidates: 'Candidate',
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

/** The name of the page at `pathname` as a Back control would say it ("Back to Interviews"). */
export function backLabelFor(pathname: string): string {
  const segments = pathname.split('?')[0].split('/').filter(Boolean)
  if (segments.length === 0) return 'Homepage'
  const [head, second, third] = segments
  if (third === 'edit') return 'Edit job description'
  if (second === 'new') return 'New job description'
  if (second && DETAIL_LABELS[head]) return DETAIL_LABELS[head]
  return SEGMENT_LABELS[head] ?? 'Previous page'
}
