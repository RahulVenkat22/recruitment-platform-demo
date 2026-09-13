import { z } from 'zod'

const name = (what: string) =>
  z
    .string()
    .trim()
    .min(1, { error: `Enter your ${what}` })
    .max(80, { error: 'Keep it under 80 characters' })

export const profileSchema = z.object({
  first_name: name('first name'),
  last_name: name('last name'),
  phone: z.string().trim().max(32, { error: 'Keep it under 32 characters' }),
  avatar_url: z
    .string()
    .trim()
    .refine((value) => value === '' || z.url({ protocol: /^https?$/ }).safeParse(value).success, {
      error: 'Enter a full image URL starting with https://',
    }),
  timezone: z.string().min(1, { error: 'Choose a timezone' }),
})
export type ProfileValues = z.infer<typeof profileSchema>

export const securitySchema = z
  .object({
    current_password: z.string().min(1, { error: 'Enter your current password' }),
    new_password: z.string().min(8, { error: 'Use at least 8 characters' }),
    confirm_password: z.string(),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    error: "Passwords don't match",
    path: ['confirm_password'],
  })
export type SecurityValues = z.infer<typeof securitySchema>

/** A short, recognisable list; the user's own zone is added when it is not here. */
export const COMMON_TIMEZONES: readonly string[] = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Africa/Johannesburg',
  'UTC',
]

export function timezoneOptions(current: string): string[] {
  return current && !COMMON_TIMEZONES.includes(current)
    ? [current, ...COMMON_TIMEZONES]
    : [...COMMON_TIMEZONES]
}
