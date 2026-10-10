import { screen, within } from '@testing-library/react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { renderWithProviders } from '@/test/render'

describe('PageHeader', () => {
  it('renders the title as h1 with subtitle, a badge beside the title, actions and tabs', () => {
    renderWithProviders(
      <PageHeader
        title="Senior Python Developer"
        titleAddon={<StatusBadge status="open" kind="jd_status" dot />}
        subtitle="Engineering • Chennai (Hybrid) • Full-time"
        actions={<Button>Edit</Button>}
        tabs={<div role="tablist">tabs</div>}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Senior Python Developer' })).toBeVisible()
    expect(screen.getByText('Engineering • Chennai (Hybrid) • Full-time')).toBeVisible()
    expect(screen.getByTitle('Open')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('renders a back link to the previous crumb', () => {
    renderWithProviders(
      <PageHeader
        title="Senior Python Developer"
        breadcrumbs={[
          { label: 'Job Descriptions', to: '/jobs' },
          { label: 'Senior Python Developer' },
        ]}
      />,
    )
    const back = screen.getByRole('link', { name: 'Back to Job Descriptions' })
    expect(back).toHaveAttribute('href', '/jobs')
    expect(within(back).getByText('Job Descriptions')).toBeInTheDocument()
  })

  it('sets the document title and shows no back link on a top-level page', () => {
    renderWithProviders(<PageHeader title="Dashboard" />)
    expect(document.title).toBe('Dashboard · TalentOS')
    expect(screen.queryByRole('link', { name: /Back to/ })).not.toBeInTheDocument()
  })

  it('uses the final breadcrumb for the document title when the heading contains markup', () => {
    renderWithProviders(
      <PageHeader title={<span>Rahul Venkat</span>} breadcrumbs={[{ label: 'Rahul Venkat' }]} />,
    )
    expect(document.title).toBe('Rahul Venkat · TalentOS')
  })

  it('exposes a meta slot under the subtitle', () => {
    renderWithProviders(<PageHeader title="JD" meta={<span>Created by Rahul</span>} />)
    expect(screen.getByText('Created by Rahul')).toBeInTheDocument()
  })
})
