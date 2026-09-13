import { AxiosError, AxiosHeaders } from 'axios'
import type { ApiErrorBody, SessionUser } from '@/types/domain'

/** Rahul, the seeded HR admin (plan.md section 18). Override any field per test. */
export function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  const first_name = overrides.first_name ?? 'Rahul'
  const last_name = overrides.last_name ?? 'Venkat'
  return {
    id: 'u1',
    email: 'rahul@aimious.demo',
    first_name,
    last_name,
    full_name: `${first_name} ${last_name}`,
    designation: 'HR Manager',
    department: 'Human Resources',
    role: 'hr_admin',
    avatar_url: null,
    phone: '+91 98400 11001',
    timezone: 'Asia/Kolkata',
    initials: `${first_name[0]}${last_name[0]}`.toUpperCase(),
    is_active: true,
    last_login: null,
    ...overrides,
  }
}

/** An axios rejection carrying the plan.md 6.10 error envelope, as the API client would produce. */
export function makeAxiosError(
  status: number,
  error: Partial<ApiErrorBody['error']> = {},
): AxiosError {
  const config = { headers: new AxiosHeaders() }
  const body: ApiErrorBody = {
    error: {
      code: error.code ?? 'error',
      message: error.message ?? `Request failed with status ${status}`,
      details: error.details ?? {},
    },
  }
  return new AxiosError(
    body.error.message,
    status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    { status, statusText: String(status), headers: {}, config, data: body },
  )
}

/** A rejection with no response at all, as when the API is unreachable. */
export function makeNetworkError(): AxiosError {
  return new AxiosError('Network Error', AxiosError.ERR_NETWORK, { headers: new AxiosHeaders() })
}
