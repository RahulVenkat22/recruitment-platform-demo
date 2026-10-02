import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginShowcase } from '@/features/auth/LoginShowcase'
import { useUiStore } from '@/lib/ui-store'

function currentStage() {
  return screen.getByRole('region', { name: 'Explore your hiring journey' })
}

describe('recruitment carousel', () => {
  beforeEach(() => useUiStore.setState({ motionEffects: true }))
  afterEach(() => {
    vi.useRealTimers()
    useUiStore.setState({ motionEffects: true })
  })

  it('brings the chosen stage forward and wraps navigation in both directions', async () => {
    const user = userEvent.setup()
    render(<LoginShowcase />)
    expect(screen.queryByRole('button', { name: /recruitment model/i })).not.toBeInTheDocument()
    await user.tab()
    await user.keyboard('{ArrowLeft}')
    expect(currentStage()).toHaveAttribute('data-selected', 'interviews')
    expect(screen.getByRole('button', { name: 'Show interviews' })).toHaveAttribute(
      'aria-current',
      'step',
    )
    expect(
      screen.getByRole('heading', { name: 'Great conversations start here.' }),
    ).toBeInTheDocument()
    await user.keyboard('{ArrowRight}')
    expect(currentStage()).toHaveAttribute('data-selected', 'resumes')
    await user.click(screen.getByRole('button', { name: 'Show candidates' }))
    expect(currentStage()).toHaveAttribute('data-selected', 'candidates')
    expect(screen.getByRole('button', { name: 'Show interviews' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('supports keyboard navigation without trapping Tab', async () => {
    const user = userEvent.setup()
    render(<LoginShowcase />)
    await user.tab()
    expect(screen.getByRole('group', { name: 'Rotate recruitment models' })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(currentStage()).toHaveAttribute('data-selected', 'candidates')
    await user.keyboard('{End}')
    expect(currentStage()).toHaveAttribute('data-selected', 'interviews')
    await user.keyboard('{Home}')
    expect(currentStage()).toHaveAttribute('data-selected', 'resumes')
    await user.tab()
    expect(screen.getByRole('button', { name: 'Show résumés' })).toHaveFocus()
  })

  it('rotates every two seconds and restarts the timer after manual selection without playback controls', () => {
    vi.useFakeTimers()
    render(<LoginShowcase />)
    expect(
      screen.queryByRole('button', { name: /automatic rotation|play|pause/i }),
    ).not.toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1999))
    expect(currentStage()).toHaveAttribute('data-selected', 'resumes')
    act(() => vi.advanceTimersByTime(1))
    expect(currentStage()).toHaveAttribute('data-selected', 'candidates')
    act(() => vi.advanceTimersByTime(500))
    fireEvent.click(screen.getByRole('button', { name: 'Show opportunities' }))
    act(() => vi.advanceTimersByTime(1999))
    expect(currentStage()).toHaveAttribute('data-selected', 'opportunities')
    expect(currentStage()).toHaveAttribute('data-playing', 'true')
    act(() => vi.advanceTimersByTime(1))
    expect(currentStage()).toHaveAttribute('data-selected', 'interviews')
  })

  it('rotates with horizontal scrolling while leaving vertical scroll and zoom alone', () => {
    render(<LoginShowcase />)
    const stage = screen.getByRole('group', { name: 'Rotate recruitment models' })
    const vertical = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    fireEvent(stage, vertical)
    expect(vertical.defaultPrevented).toBe(false)
    expect(currentStage()).toHaveAttribute('data-selected', 'resumes')
    const zoom = new WheelEvent('wheel', {
      deltaX: 100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(stage, zoom)
    expect(zoom.defaultPrevented).toBe(false)
    const horizontal = new WheelEvent('wheel', { deltaX: 100, bubbles: true, cancelable: true })
    fireEvent(stage, horizontal)
    expect(horizontal.defaultPrevented).toBe(true)
    expect(currentStage()).toHaveAttribute('data-selected', 'candidates')
  })

  it('keeps manual controls available with motion effects disabled', () => {
    vi.useFakeTimers()
    useUiStore.setState({ motionEffects: false })
    render(<LoginShowcase />)
    act(() => vi.advanceTimersByTime(15000))
    expect(currentStage()).toHaveAttribute('data-selected', 'resumes')
    expect(screen.queryByRole('button', { name: /automatic rotation/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show candidates' }))
    expect(currentStage()).toHaveAttribute('data-selected', 'candidates')
  })
})
