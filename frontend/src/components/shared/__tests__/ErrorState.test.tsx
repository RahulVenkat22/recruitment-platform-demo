import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorState } from '@/components/shared/ErrorState'
import { makeAxiosError, makeNetworkError } from '@/test/fixtures'

describe('ErrorState', () => {
  it('shows the title, message and a retry button that calls back', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <ErrorState
        title="Couldn't load candidates"
        message="The API timed out."
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load candidates")
    expect(screen.getByText('The API timed out.')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('derives a message from an API error envelope and omits retry when there is no handler', () => {
    render(<ErrorState error={makeAxiosError(403, { message: 'You do not have access.' })} />)
    expect(screen.getByText('You do not have access.')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('explains a network failure in plain words', () => {
    render(<ErrorState error={makeNetworkError()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/can't reach the server/i)
  })

  it('renders an inline variant for section-level errors', () => {
    render(<ErrorState variant="inline" message="Timeline failed to load." onRetry={() => {}} />)
    expect(screen.getByRole('alert')).toHaveAttribute('data-variant', 'inline')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
