import { screen, within } from '@testing-library/react'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { useUiStore } from '@/lib/ui-store'
import { renderWithProviders } from '@/test/render'

describe('PageHeader', () => {
  beforeEach(() => {
    useUiStore.setState({ breadcrumbs: [] })
  })

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

  it('publishes breadcrumbs to the top bar store and renders a back link to the previous crumb', () => {
    renderWithProviders(
      <PageHeader
        title="Senior Python Developer"
        breadcrumbs={[
          { label: 'Job Descriptions', to: '/jobs' },
          { label: 'Senior Python Developer' },
        ]}
      />,
    )
    expect(useUiStore.getState().breadcrumbs).toEqual([
      { label: 'Job Descriptions', to: '/jobs' },
      { label: 'Senior Python Developer' },
    ])
    const back = screen.getByRole('link', { name: 'Back to Job Descriptions' })
    expect(back).toHaveAttribute('href', '/jobs')
    expect(within(back).getByText('Job Descriptions')).toBeInTheDocument()
  })

  it('falls back to the title as the only crumb and shows no back link', () => {
    renderWithProviders(<PageHeader title="Dashboard" />)
    expect(useUiStore.getState().breadcrumbs).toEqual([{ label: 'Dashboard' }])
    expect(screen.queryByRole('link', { name: /Back to/ })).not.toBeInTheDocument()
  })

  it('clears the published crumbs on unmount', () => {
    const { unmount } = renderWithProviders(<PageHeader title="Candidates" />)
    unmount()
    expect(useUiStore.getState().breadcrumbs).toEqual([])
  })

  it('exposes a meta slot under the subtitle', () => {
    renderWithProviders(<PageHeader title="JD" meta={<span>Created by Rahul</span>} />)
    expect(screen.getByText('Created by Rahul')).toBeInTheDocument()
  })
})
