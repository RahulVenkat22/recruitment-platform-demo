import { render, screen } from '@testing-library/react'
import { SourceBadge } from '@/components/shared/SourceBadge'
import { useEnumsStore } from '@/lib/enums'
import { renderWithProviders } from '@/test/render'

describe('SourceBadge', () => {
  beforeEach(() => {
    useEnumsStore.getState().reset()
  })

  it('renders the source label with its plan.md colours and an icon', () => {
    render(<SourceBadge source="linkedin" />)
    const badge = screen.getByTestId('source-badge')
    expect(badge).toHaveTextContent('LinkedIn')
    expect(badge).toHaveAttribute('data-source', 'linkedin')
    expect(badge.style.getPropertyValue('--badge-bg')).toBe('#E1EEF8')
    expect(badge.style.getPropertyValue('--badge-fg')).toBe('#0A66C2')
    expect(badge.querySelector('svg')).not.toBeNull()
  })

  it('renders icon-only with the label as a tooltip and accessible name', async () => {
    renderWithProviders(<SourceBadge source="naukri" iconOnly />)
    const badge = screen.getByLabelText('Naukri')
    expect(badge).toHaveAttribute('data-icon-only', 'true')
    expect(badge).not.toHaveTextContent('Naukri')
  })

  it('stacks several sources as "Internal + LinkedIn"', () => {
    render(<SourceBadge source={['internal', 'linkedin']} />)
    const badge = screen.getByTestId('source-badge')
    expect(badge).toHaveTextContent('Internal + LinkedIn')
    expect(badge.querySelectorAll('svg')).toHaveLength(2)
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<SourceBadge source={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
