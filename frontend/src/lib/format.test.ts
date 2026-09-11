import {
  formatCurrencyINR,
  formatDate,
  formatDateTime,
  formatRelative,
  fullName,
  initials,
} from '@/lib/format'

describe('initials', () => {
  it('takes the first letter of the first and last word', () => {
    expect(initials('Rahul Venkat')).toBe('RV')
    expect(initials('Lakshmi Narayanan Iyer')).toBe('LI')
  })

  it('uses the first two letters of a single word', () => {
    expect(initials('rahul')).toBe('RA')
  })

  it('ignores surrounding and repeated whitespace', () => {
    expect(initials('  priya   sharma ')).toBe('PS')
  })

  it('returns an empty string for missing names', () => {
    expect(initials('')).toBe('')
    expect(initials('   ')).toBe('')
    expect(initials(null)).toBe('')
    expect(initials(undefined)).toBe('')
  })
})

describe('formatRelative', () => {
  const now = new Date('2026-09-11T12:00:00+05:30')
  const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000)

  it('says "just now" inside 45 seconds either way', () => {
    expect(formatRelative(ago(10), now)).toBe('just now')
    expect(formatRelative(ago(-30), now)).toBe('just now')
  })

  it('uses minutes, hours and days for the past week', () => {
    expect(formatRelative(ago(50), now)).toBe('1m ago')
    expect(formatRelative(ago(5 * 60), now)).toBe('5m ago')
    expect(formatRelative(ago(2 * 3600), now)).toBe('2h ago')
    expect(formatRelative(ago(23 * 3600 + 59 * 60), now)).toBe('23h ago')
    expect(formatRelative(ago(3 * 86400), now)).toBe('3d ago')
  })

  it('reads "in ..." for future times', () => {
    expect(formatRelative(ago(-2 * 3600), now)).toBe('in 2h')
  })

  it('falls back to the full date after a week', () => {
    expect(formatRelative(ago(10 * 86400), now)).toBe('1 Sep 2026')
  })

  it('accepts ISO strings and returns an empty string for invalid input', () => {
    expect(formatRelative(ago(3600).toISOString(), now)).toBe('1h ago')
    expect(formatRelative('not a date', now)).toBe('')
    expect(formatRelative(null, now)).toBe('')
  })
})

describe('formatDate and formatDateTime', () => {
  it('formats a date in the day month year order used across the UI', () => {
    const date = new Date(2026, 8, 11, 9, 30)
    expect(formatDate(date)).toBe('11 Sep 2026')
    expect(formatDateTime(date)).toBe('11 Sep 2026, 09:30 AM')
  })

  it('returns an empty string for missing values', () => {
    expect(formatDate(undefined)).toBe('')
    expect(formatDateTime('')).toBe('')
  })
})

describe('formatCurrencyINR', () => {
  it('groups by lakh and crore', () => {
    expect(formatCurrencyINR(1800000)).toBe('₹18,00,000')
    expect(formatCurrencyINR(12500000)).toBe('₹1,25,00,000')
  })

  it('produces the compact form for headers', () => {
    expect(formatCurrencyINR(1800000, { compact: true })).toBe('₹18L')
    expect(formatCurrencyINR(2850000, { compact: true })).toBe('₹28.5L')
    expect(formatCurrencyINR(12000000, { compact: true })).toBe('₹1.2Cr')
    expect(formatCurrencyINR(50000, { compact: true })).toBe('₹50K')
    expect(formatCurrencyINR(999, { compact: true })).toBe('₹999')
  })

  it('returns an empty string for missing values', () => {
    expect(formatCurrencyINR(null)).toBe('')
    expect(formatCurrencyINR(undefined)).toBe('')
  })
})

describe('fullName', () => {
  it('joins first and last name', () => {
    expect(fullName({ first_name: 'Rahul', last_name: 'Venkat' })).toBe('Rahul Venkat')
    expect(fullName(null)).toBe('')
  })
})
