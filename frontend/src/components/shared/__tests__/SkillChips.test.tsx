import { render, screen, within } from '@testing-library/react'
import { SkillChips } from '@/components/shared/SkillChips'

const skills = [
  { name: 'Python', matched: true, proficiency: 5 },
  { name: 'Django', matched: true },
  { name: 'PostgreSQL', matched: false },
  { name: 'AWS' },
  { name: 'Docker' },
]

describe('SkillChips', () => {
  it('renders neutral chips by default', () => {
    render(<SkillChips skills={skills} />)
    const list = screen.getByRole('list', { name: 'Skills' })
    const chips = within(list).getAllByRole('listitem')
    expect(chips).toHaveLength(5)
    expect(chips[0]).toHaveAttribute('data-state', 'neutral')
    expect(chips[0]).toHaveTextContent('Python')
  })

  it('caps the list at `max` with a +N chip carrying the hidden names', () => {
    render(<SkillChips skills={skills} max={3} />)
    const chips = screen.getAllByRole('listitem')
    expect(chips).toHaveLength(4)
    const overflow = chips[3]
    expect(overflow).toHaveTextContent('+2')
    expect(overflow).toHaveAttribute('title', 'AWS, Docker')
  })

  it('highlights matched skills with a check and missing ones outlined', () => {
    render(<SkillChips skills={skills} highlight />)
    const chips = screen.getAllByRole('listitem')
    expect(chips[0]).toHaveAttribute('data-state', 'matched')
    expect(chips[0].querySelector('svg')).not.toBeNull()
    expect(chips[2]).toHaveAttribute('data-state', 'missing')
    expect(chips[3]).toHaveAttribute('data-state', 'neutral')
  })

  it('shows the proficiency in the title when present', () => {
    render(<SkillChips skills={skills} />)
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('title', 'Python · proficiency 5/5')
  })

  it('renders a quiet placeholder for no skills', () => {
    render(<SkillChips skills={[]} />)
    expect(screen.getByText('No skills listed')).toBeInTheDocument()
  })
})
