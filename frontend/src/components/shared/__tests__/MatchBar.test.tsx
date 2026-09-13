import { render, screen } from '@testing-library/react'
import { MatchBar } from '@/components/shared/MatchBar'

describe('MatchBar', () => {
  it('renders label, value and weight with an accessible progressbar', () => {
    render(<MatchBar label="Skills" value={92} weight={40} />)
    const bar = screen.getByRole('progressbar', { name: 'Skills' })
    expect(bar).toHaveAttribute('aria-valuenow', '92')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('data-tone', 'emerald')
    expect(screen.getByText('92%')).toBeInTheDocument()
    expect(screen.getByText('Weight 40%')).toBeInTheDocument()
  })

  it('uses the plan.md colour thresholds and clamps the value', () => {
    const { rerender } = render(<MatchBar label="Experience" value={72} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-tone', 'amber')
    rerender(<MatchBar label="Domain" value={-5} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-tone', 'slate')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
    expect(screen.queryByText(/Weight/)).not.toBeInTheDocument()
  })
})
