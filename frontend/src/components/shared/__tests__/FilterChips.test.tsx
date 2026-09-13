import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterChips, type FilterChipOption } from '@/components/shared/FilterChips'

const options: FilterChipOption[] = [
  { key: 'interview', label: 'Interview', color: '#1D4ED8', bg: '#E4ECFB', count: 6 },
  { key: 'offer', label: 'Offer', color: '#B7791F', bg: '#FBF1DC', count: 2 },
  { key: 'decision', label: 'Rejected / On Hold', color: '#B42318', bg: '#FCE8E6', count: 0 },
]

describe('FilterChips', () => {
  it('renders each option as a checkbox with its count and checked state', () => {
    render(<FilterChips options={options} selected={['interview']} onChange={() => {}} />)
    const interview = screen.getByRole('checkbox', { name: /Interview/ })
    expect(interview).toBeChecked()
    expect(interview).toHaveTextContent('6')
    expect(interview.style.getPropertyValue('--chip-color')).toBe('#1D4ED8')
    expect(screen.getByRole('checkbox', { name: /Offer/ })).not.toBeChecked()
  })

  it('toggles a key on click and via the space key', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterChips options={options} selected={['interview']} onChange={onChange} />)

    await user.click(screen.getByRole('checkbox', { name: /Offer/ }))
    expect(onChange).toHaveBeenLastCalledWith(['interview', 'offer'])

    screen.getByRole('checkbox', { name: /Interview/ }).focus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('offers All and None text buttons when allowAllNone is set', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<FilterChips options={options} selected={['offer']} onChange={onChange} allowAllNone />)

    await user.click(screen.getByRole('button', { name: 'All' }))
    expect(onChange).toHaveBeenLastCalledWith(['interview', 'offer', 'decision'])

    await user.click(screen.getByRole('button', { name: 'None' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('hides All and None by default', () => {
    render(<FilterChips options={options} selected={[]} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: 'All' })).not.toBeInTheDocument()
  })
})
