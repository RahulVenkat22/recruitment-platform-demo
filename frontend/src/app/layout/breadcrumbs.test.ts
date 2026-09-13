import { deriveBreadcrumbs } from '@/app/layout/breadcrumbs'

describe('deriveBreadcrumbs', () => {
  it('maps top-level routes to their sidebar labels', () => {
    expect(deriveBreadcrumbs('/dashboard')).toEqual([{ label: 'Dashboard' }])
    expect(deriveBreadcrumbs('/jobs')).toEqual([{ label: 'Job Descriptions' }])
    expect(deriveBreadcrumbs('/settings')).toEqual([{ label: 'Settings' }])
  })

  it('links parent segments and labels known children', () => {
    expect(deriveBreadcrumbs('/jobs/new')).toEqual([
      { label: 'Job Descriptions', to: '/jobs' },
      { label: 'New' },
    ])
    expect(deriveBreadcrumbs('/jobs/abc-123/edit')).toEqual([
      { label: 'Job Descriptions', to: '/jobs' },
      { label: 'Details', to: '/jobs/abc-123' },
      { label: 'Edit' },
    ])
    expect(deriveBreadcrumbs('/candidates/c9')).toEqual([
      { label: 'Candidates', to: '/candidates' },
      { label: 'Details' },
    ])
  })

  it('ignores trailing slashes and query strings and handles the root', () => {
    expect(deriveBreadcrumbs('/jobs/')).toEqual([{ label: 'Job Descriptions' }])
    expect(deriveBreadcrumbs('/')).toEqual([])
    expect(deriveBreadcrumbs('')).toEqual([])
  })
})
