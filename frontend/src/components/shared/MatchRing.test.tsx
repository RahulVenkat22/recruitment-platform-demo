import { screen } from '@testing-library/react'
import { MatchRing } from '@/components/shared/MatchRing'
import { matchTone } from '@/components/shared/match-tone'
import { renderWithProviders } from '@/test/render'

describe('MatchRing', () => {
  it('picks the tone from the plan.md thresholds', () => {
    expect(matchTone(95)).toBe('emerald')
    expect(matchTone(85)).toBe('emerald')
    expect(matchTone(84)).toBe('amber')
    expect(matchTone(70)).toBe('amber')
    expect(matchTone(69)).toBe('slate')
    expect(matchTone(0)).toBe('slate')
  })

  it('renders the percentage with an accessible label and clamps out-of-range values', () => {
    renderWithProviders(<MatchRing value={95} />)
    const ring = screen.getByRole('img', { name: '95% match' })
    expect(ring).toHaveAttribute('data-tone', 'emerald')
    expect(ring).toHaveTextContent('95')

    renderWithProviders(<MatchRing value={140} />)
    expect(screen.getByRole('img', { name: '100% match' })).toBeInTheDocument()
  })
})
