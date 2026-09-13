import { render, screen } from '@testing-library/react'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useEnumsStore } from '@/lib/enums'

describe('StatusBadge', () => {
  beforeEach(() => {
    useEnumsStore.getState().reset()
  })

  it('renders the application status label with its plan.md colours', () => {
    render(<StatusBadge status="ai_shortlisted" />)
    const badge = screen.getByTitle('AI Shortlisted')
    expect(badge).toHaveTextContent('AI Shortlisted')
    expect(badge).toHaveAttribute('data-status', 'ai_shortlisted')
    expect(badge.style.getPropertyValue('--badge-bg')).toBe('#E8EAFB')
    expect(badge.style.getPropertyValue('--badge-fg')).toBe('#3F3FB5')
  })

  it('works for JD statuses too', () => {
    render(<StatusBadge status="open" kind="jd_status" />)
    const badge = screen.getByTitle('Open')
    expect(badge.style.getPropertyValue('--badge-bg')).toBe('#E3F3EA')
  })

  it('renders an optional dot and the size attribute', () => {
    render(<StatusBadge status="selected" size="md" dot />)
    const badge = screen.getByTitle('Selected')
    expect(badge).toHaveAttribute('data-size', 'md')
    expect(badge.querySelector('[data-slot="status-dot"]')).not.toBeNull()
  })

  it('humanises unknown keys instead of crashing', () => {
    render(<StatusBadge status="brand_new_thing" />)
    expect(screen.getByText('Brand New Thing')).toBeInTheDocument()
  })
})
