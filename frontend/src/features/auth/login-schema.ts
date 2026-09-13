import { z } from 'zod'
import { getApiError } from '@/lib/api'

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { error: 'Enter your email or username' })
    .refine((value) => !value.includes('@') || z.email().safeParse(value).success, {
      error: 'Enter a valid email address',
    }),
  password: z.string().min(1, { error: 'Enter your password' }),
  remember_me: z.boolean(),
})

export type LoginValues = z.infer<typeof loginSchema>

export type LoginFailureKind = 'credentials' | 'throttled' | 'network' | 'other'

export interface LoginFailure {
  kind: LoginFailureKind
  message: string
}

/** Turns a rejected `POST /auth/login/` into the sentence the form shows (plan.md 9.1). */
export function describeLoginFailure(error: unknown): LoginFailure {
  const parsed = getApiError(error)
  if (parsed.status === 401 || parsed.code === 'invalid_credentials') {
    return { kind: 'credentials', message: 'Incorrect email or password.' }
  }
  if (parsed.status === 429 || parsed.code === 'throttled') {
    return { kind: 'throttled', message: 'Too many attempts, try again in a minute.' }
  }
  if (parsed.isNetworkError) {
    return {
      kind: 'network',
      message: "Can't reach the server. Check your connection and try again.",
    }
  }
  return { kind: 'other', message: parsed.message ?? 'Something went wrong. Try again.' }
}
