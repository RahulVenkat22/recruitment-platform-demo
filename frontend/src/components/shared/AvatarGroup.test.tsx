import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AvatarGroup } from '@/components/shared/AvatarGroup'
import { renderWithProviders } from '@/test/render'
import type { Person } from '@/types/domain'

const people: Person[] = [
  { id: 'u1', name: 'Rahul Venkat', designation: 'HR Manager', avatar_url: null },
  { id: 'u2', name: 'Priya Sharma', designation: 'HR Executive', avatar_url: null },
  { id: 'u3', name: 'Arun Kumar', designation: 'Engineering Manager', avatar_url: null },
  { id: 'u4', name: 'Divya Raman', designation: 'Senior Software Engineer', avatar_url: null },
  { id: 'u5', name: 'Suresh Menon', designation: 'Lead Data Scientist', avatar_url: null },
  { id: 'u6', name: 'Nisha Patel', designation: 'DevOps Lead', avatar_url: null },
  { id: 'u7', name: 'Lakshmi Narayanan', designation: 'Frontend Lead', avatar_url: null },
]

describe('AvatarGroup', () => {
  it('shows up to four avatars and a +N pill for the rest', () => {
    renderWithProviders(<AvatarGroup people={people} />)
    const group = screen.getByRole('button', { name: '7 people' })
    expect(within(group).getAllByRole('img')).toHaveLength(4)
    expect(within(group).getByText('+3')).toBeInTheDocument()
  })

  it('renders no pill when everyone fits', () => {
    renderWithProviders(<AvatarGroup people={people.slice(0, 3)} />)
    const group = screen.getByRole('button', { name: '3 people' })
    expect(within(group).getAllByRole('img')).toHaveLength(3)
    expect(within(group).queryByText(/^\+/)).not.toBeInTheDocument()
  })

  it('respects a custom max', () => {
    renderWithProviders(<AvatarGroup people={people} max={2} />)
    const group = screen.getByRole('button', { name: '7 people' })
    expect(within(group).getAllByRole('img')).toHaveLength(2)
    expect(within(group).getByText('+5')).toBeInTheDocument()
  })

  it('renders nothing for an empty list', () => {
    renderWithProviders(<AvatarGroup people={[]} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows "Name • Designation" in a tooltip on hover', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AvatarGroup people={people} />)

    await user.hover(screen.getByRole('img', { name: 'Priya Sharma' }))

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Priya Sharma • HR Executive')
  })

  it('opens a popover listing everyone when clicked', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AvatarGroup people={people} />)

    await user.click(screen.getByRole('button', { name: '7 people' }))

    const dialog = await screen.findByRole('dialog')
    for (const person of people) {
      expect(within(dialog).getByText(person.name)).toBeInTheDocument()
    }
    expect(within(dialog).getByText('Lead Data Scientist')).toBeInTheDocument()
  })
})
