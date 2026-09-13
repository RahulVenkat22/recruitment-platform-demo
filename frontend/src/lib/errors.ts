import { getApiError } from '@/lib/api'

export const DEFAULT_ERROR_TITLE = 'Something went wrong'
export const NETWORK_MESSAGE = "We can't reach the server. Check your connection and try again."
export const GENERIC_MESSAGE = 'The request failed. Try again in a moment.'

/** A plain-language sentence for any thrown value; axios errors carrying the plan.md 6.10 envelope give their server message. */
export function describeError(error: unknown): string {
  if (error === undefined || error === null) return GENERIC_MESSAGE
  const parsed = getApiError(error)
  if (parsed.isNetworkError) return NETWORK_MESSAGE
  if (parsed.message) return parsed.message
  return GENERIC_MESSAGE
}
