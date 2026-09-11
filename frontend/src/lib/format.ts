import { differenceInSeconds, format, isValid } from 'date-fns'

export type DateInput = string | number | Date | null | undefined

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return isValid(date) ? date : null
}

/** "11 Sep 2026" */
export function formatDate(value: DateInput): string {
  const date = toDate(value)
  return date ? format(date, 'd MMM yyyy') : ''
}

/** "11 Sep 2026, 09:30 AM" */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value)
  return date ? format(date, 'd MMM yyyy, hh:mm a') : ''
}

/**
 * Compact relative time for timelines and tables: "just now", "5m ago", "2h ago",
 * "3d ago", or the full date once it is a week old. Future times read "in 2h".
 */
export function formatRelative(value: DateInput, now: Date = new Date()): string {
  const date = toDate(value)
  if (!date) return ''

  const seconds = differenceInSeconds(date, now)
  const distance = Math.abs(seconds)
  if (distance < 45) return 'just now'

  let amount: string
  if (distance < HOUR) amount = `${Math.max(1, Math.floor(distance / MINUTE))}m`
  else if (distance < DAY) amount = `${Math.floor(distance / HOUR)}h`
  else if (distance < 7 * DAY) amount = `${Math.floor(distance / DAY)}d`
  else return formatDate(date)

  return seconds < 0 ? `${amount} ago` : `in ${amount}`
}

const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

function trimDecimal(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/**
 * Indian rupee formatting. Default uses lakh grouping ("₹18,00,000");
 * `compact` gives the short form used in headers and chips ("₹18L", "₹1.2Cr").
 */
export function formatCurrencyINR(
  value: number | null | undefined,
  options: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  if (!options.compact) return inrFormatter.format(value)

  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 1e7) return `${sign}₹${trimDecimal(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${trimDecimal(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}₹${trimDecimal(abs / 1e3)}K`
  return inrFormatter.format(value)
}

/**
 * Two uppercase initials for avatar fallbacks: first and last word of the name,
 * or the first two letters of a single word. Empty input gives an empty string.
 */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function fullName(
  user: { first_name: string; last_name: string } | null | undefined,
): string {
  if (!user) return ''
  return `${user.first_name} ${user.last_name}`.trim()
}
