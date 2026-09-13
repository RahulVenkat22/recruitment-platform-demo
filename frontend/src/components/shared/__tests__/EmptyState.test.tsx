import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InboxIcon } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'

describe('EmptyState', () => {
  it('renders the icon, an h3 title, the description and the action', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <EmptyState
        icon={InboxIcon}
        title="No job descriptions yet"
        description="Create the first one to start sourcing candidates."
        action={<Button onClick={onClick}>Create job description</Button>}
      />,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'No job descriptions yet' })).toBeVisible()
    expect(screen.getByText('Create the first one to start sourcing candidates.')).toBeVisible()
    expect(screen.getByTestId('empty-state-icon')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create job description' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('works with only a title and a compact size', () => {
    render(<EmptyState title="Nothing here" size="sm" />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('data-size', 'sm')
    expect(screen.queryByTestId('empty-state-icon')).not.toBeInTheDocument()
  })
})
