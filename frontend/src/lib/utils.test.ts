import { cn } from '@/lib/utils'

describe('cn', () => {
  it('joins truthy class names and drops falsy ones', () => {
    const hidden = [] as string[]
    expect(cn('a', hidden.length > 0 && 'b', undefined, null, 'c')).toBe('a c')
  })

  it('accepts arrays and objects like clsx', () => {
    expect(cn(['a', { b: true, c: false }], 'd')).toBe('a b d')
  })

  it('resolves conflicting Tailwind utilities in favour of the last one', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    expect(cn('text-ink', 'text-primary')).toBe('text-primary')
  })

  it('returns an empty string for no input', () => {
    expect(cn()).toBe('')
  })
})
