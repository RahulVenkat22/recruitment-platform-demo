import { screen, within } from '@testing-library/react'
import { UsersIcon } from 'lucide-react'
import { MetricCard } from '@/components/shared/MetricCard'
import { renderWithProviders } from '@/test/render'

describe('MetricCard', () => {
  it('renders the label, value, icon and a positive delta vs last 7 days', () => {
    renderWithProviders(
      <MetricCard label="Total candidates" value={184} delta={12} icon={UsersIcon} />,
    )
    const card = screen.getByTestId('metric-card')
    expect(within(card).getByText('Total candidates')).toBeInTheDocument()
    expect(within(card).getByText('184')).toBeInTheDocument()
    const delta = within(card).getByTestId('metric-delta')
    expect(delta).toHaveAttribute('data-direction', 'up')
    expect(delta).toHaveTextContent('+12')
    expect(within(card).getByText('vs last 7 days')).toBeInTheDocument()
    expect(within(card).getByTestId('metric-icon')).toBeInTheDocument()
  })

  it('renders a negative delta in the down direction and zero as flat', () => {
    const { rerender } = renderWithProviders(<MetricCard label="Rejected" value={3} delta={-2} />)
    expect(screen.getByTestId('metric-delta')).toHaveAttribute('data-direction', 'down')
    expect(screen.getByTestId('metric-delta')).toHaveTextContent('-2')
    rerender(<MetricCard label="Rejected" value={3} delta={0} />)
    expect(screen.getByTestId('metric-delta')).toHaveAttribute('data-direction', 'flat')
  })

  it('omits the delta row when no delta is given', () => {
    renderWithProviders(<MetricCard label="Offers pending" value={4} />)
    expect(screen.queryByTestId('metric-delta')).not.toBeInTheDocument()
    expect(screen.queryByText('vs last 7 days')).not.toBeInTheDocument()
  })

  it('becomes a link when `to` is set', () => {
    renderWithProviders(<MetricCard label="Active JDs" value={6} to="/jobs?status=open" />)
    expect(screen.getByRole('link', { name: /Active JDs/ })).toHaveAttribute(
      'href',
      '/jobs?status=open',
    )
  })

  it('shows a skeleton while loading and keeps the label readable', () => {
    renderWithProviders(<MetricCard label="Shortlisted" value={41} loading />)
    const card = screen.getByTestId('metric-card')
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(within(card).queryByText('41')).not.toBeInTheDocument()
  })

  it('has a compact variant for the JD detail metric row', () => {
    renderWithProviders(<MetricCard label="Contacted" value={30} variant="compact" />)
    expect(screen.getByTestId('metric-card')).toHaveAttribute('data-variant', 'compact')
  })

  it('formats large numbers with grouping', () => {
    renderWithProviders(<MetricCard label="Profiles" value={12840} />)
    expect(screen.getByText('12,840')).toBeInTheDocument()
  })
})
