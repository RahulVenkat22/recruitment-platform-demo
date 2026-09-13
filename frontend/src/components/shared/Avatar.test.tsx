import { fireEvent, render, screen } from '@testing-library/react'
import { Avatar } from '@/components/shared/Avatar'
import { AVATAR_HUES, AVATAR_SIZES, avatarHue } from '@/components/shared/avatar-utils'

describe('Avatar', () => {
  it('renders two initials with the name as the accessible label when there is no image', () => {
    render(<Avatar name="Rahul Venkat" />)
    const avatar = screen.getByRole('img', { name: 'Rahul Venkat' })
    expect(avatar).toHaveTextContent('RV')
    expect(avatar).toHaveAttribute('data-size', 'md')
  })

  it('uses the first two letters of a single-word name', () => {
    render(<Avatar name="Aimious" />)
    expect(screen.getByRole('img', { name: 'Aimious' })).toHaveTextContent('AI')
  })

  it('hashes the name into one of the eight muted hues, deterministically', () => {
    const a = avatarHue('Rahul Venkat')
    const b = avatarHue('Rahul Venkat')
    expect(a).toBe(b)
    expect(AVATAR_HUES).toContain(a)
    // Different names spread across the palette rather than collapsing onto one hue.
    const hues = new Set(
      ['Rahul Venkat', 'Priya Sharma', 'Arun Kumar', 'Divya Raman', 'John Doe', 'Nisha Patel'].map(
        avatarHue,
      ),
    )
    expect(hues.size).toBeGreaterThan(2)
    expect(avatarHue('')).toBe(AVATAR_HUES[0])
  })

  it('exposes the hue on the element so the fill is reproducible', () => {
    render(<Avatar name="Priya Sharma" />)
    expect(screen.getByRole('img', { name: 'Priya Sharma' })).toHaveAttribute(
      'data-hue',
      avatarHue('Priya Sharma'),
    )
  })

  it('renders the photo with the name as alt text and object-cover', () => {
    render(<Avatar name="Rahul Venkat" src="https://example.test/rahul.jpg" size="lg" />)
    const img = screen.getByRole('img', { name: 'Rahul Venkat' })
    expect(img.tagName).toBe('IMG')
    expect(img).toHaveAttribute('src', 'https://example.test/rahul.jpg')
    expect(img).toHaveClass('object-cover')
    expect(screen.queryByText('RV')).not.toBeInTheDocument()
  })

  it('falls back to initials when the image fails to load', () => {
    render(<Avatar name="Rahul Venkat" src="https://example.test/broken.jpg" />)
    fireEvent.error(screen.getByRole('img', { name: 'Rahul Venkat' }))
    const fallback = screen.getByRole('img', { name: 'Rahul Venkat' })
    expect(fallback.tagName).not.toBe('IMG')
    expect(fallback).toHaveTextContent('RV')
  })

  it('sizes the circle from the size scale in pixels', () => {
    const { rerender } = render(<Avatar name="Rahul Venkat" size="xs" />)
    expect(screen.getByRole('img')).toHaveStyle({ width: '20px', height: '20px' })
    rerender(<Avatar name="Rahul Venkat" size="2xl" />)
    expect(screen.getByRole('img')).toHaveStyle({ width: '96px', height: '96px' })
    expect(AVATAR_SIZES).toEqual({ xs: 20, sm: 24, md: 32, lg: 40, xl: 64, '2xl': 96 })
  })

  it('adds a surface ring on request', () => {
    render(<Avatar name="Rahul Venkat" ring />)
    expect(screen.getByRole('img')).toHaveClass('ring-2')
  })
})
