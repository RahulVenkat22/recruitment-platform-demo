import { render, screen, within } from '@testing-library/react'
import {
  SkeletonCard,
  SkeletonMetricRow,
  SkeletonTableRows,
  SkeletonText,
  SkeletonTimeline,
} from '@/components/shared/Skeletons'

describe('Skeletons', () => {
  it('SkeletonText renders the requested number of lines, the last one shorter', () => {
    render(<SkeletonText lines={3} />)
    const block = screen.getByLabelText('Loading')
    const lines = within(block).getAllByTestId('skeleton-line')
    expect(lines).toHaveLength(3)
    expect(lines[2].className).toContain('w-2/3')
  })

  it('SkeletonCard is marked busy and has the card radius', () => {
    render(<SkeletonCard />)
    const card = screen.getByLabelText('Loading card')
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(card.className).toContain('rounded-card')
  })

  it('SkeletonTableRows renders rows x columns of cells inside a tbody', () => {
    render(
      <table>
        <SkeletonTableRows rows={8} columns={4} />
      </table>,
    )
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(8)
    expect(within(rows[0]).getAllByRole('cell')).toHaveLength(4)
  })

  it('SkeletonMetricRow renders one placeholder per metric card', () => {
    render(<SkeletonMetricRow count={7} compact />)
    const row = screen.getByLabelText('Loading metrics')
    expect(within(row).getAllByTestId('skeleton-metric')).toHaveLength(7)
    expect(row).toHaveAttribute('data-compact', 'true')
  })

  it('SkeletonTimeline renders the given number of items along a line', () => {
    render(<SkeletonTimeline items={5} />)
    const list = screen.getByLabelText('Loading timeline')
    expect(within(list).getAllByTestId('skeleton-timeline-item')).toHaveLength(5)
  })
})
