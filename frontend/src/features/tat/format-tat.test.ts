import { describe, expect, it } from 'vitest'
import { formatTat } from './format-tat'

describe('TAT duration display', () => {
  it('distinguishes a missing milestone from a zero or sub-minute duration', () => {
    expect(formatTat(null)).toBe('—')
    expect(formatTat(0)).toBe('0m')
    expect(formatTat(59)).toBe('<1m')
  })

  it('uses elapsed hours and days without rounding a duration up', () => {
    expect(formatTat(60)).toBe('1m')
    expect(formatTat(3599)).toBe('59m')
    expect(formatTat(3660)).toBe('1h 1m')
    expect(formatTat(86399)).toBe('23h 59m')
    expect(formatTat(90000)).toBe('1d 1h')
  })
})
