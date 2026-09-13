import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from 'axios'
import { useAuthStore, type AuthStore, type SessionUser } from './auth-store'
import type { ApiErrorBody } from '@/types/domain'

export const API_PREFIX = '/api/v1'

export const endpoints = {
  health: `${API_PREFIX}/health/`,
  authLogin: `${API_PREFIX}/auth/login/`,
  authRefresh: `${API_PREFIX}/auth/refresh/`,
  authLogout: `${API_PREFIX}/auth/logout/`,
  authMe: `${API_PREFIX}/auth/me/`,
  authChangePassword: `${API_PREFIX}/auth/change-password/`,
  authForgotPassword: `${API_PREFIX}/auth/forgot-password/`,
  metaEnums: `${API_PREFIX}/meta/enums/`,
  users: `${API_PREFIX}/users/`,
  jobs: `${API_PREFIX}/job-descriptions/`,
  jobFacets: `${API_PREFIX}/job-descriptions/facets/`,
  job: (id: string) => `${API_PREFIX}/job-descriptions/${id}/`,
  jobAction: (id: string, action: string) => `${API_PREFIX}/job-descriptions/${id}/${action}/`,
  jobVersion: (id: string, version: number) =>
    `${API_PREFIX}/job-descriptions/${id}/versions/${version}/`,
  jobParticipant: (id: string, participantId: string) =>
    `${API_PREFIX}/job-descriptions/${id}/participants/${participantId}/`,
  skills: `${API_PREFIX}/skills/`,
  activities: `${API_PREFIX}/activities/`,
  sources: `${API_PREFIX}/sources/`,
  searches: `${API_PREFIX}/searches/`,
  applications: `${API_PREFIX}/applications/`,
  application: (id: string) => `${API_PREFIX}/applications/${id}/`,
  applicationAction: (id: string, action: string) => `${API_PREFIX}/applications/${id}/${action}/`,
  applicationsBulkTransition: `${API_PREFIX}/applications/bulk-transition/`,
  candidates: `${API_PREFIX}/candidates/`,
  candidate: (id: string) => `${API_PREFIX}/candidates/${id}/`,
  interviews: `${API_PREFIX}/interviews/`,
  interview: (id: string) => `${API_PREFIX}/interviews/${id}/`,
  interviewAction: (id: string, action: string) => `${API_PREFIX}/interviews/${id}/${action}/`,
  communications: `${API_PREFIX}/communications/`,
  offers: `${API_PREFIX}/offers/`,
  offer: (id: string) => `${API_PREFIX}/offers/${id}/`,
  offerAction: (id: string, action: string) => `${API_PREFIX}/offers/${id}/${action}/`,
  onboardings: `${API_PREFIX}/onboardings/`,
  onboarding: (id: string) => `${API_PREFIX}/onboardings/${id}/`,
  onboardingAction: (id: string, action: string) => `${API_PREFIX}/onboardings/${id}/${action}/`,
  notifications: `${API_PREFIX}/notifications/`,
  notificationsUnreadCount: `${API_PREFIX}/notifications/unread-count/`,
  notificationsReadAll: `${API_PREFIX}/notifications/read-all/`,
  notificationRead: (id: string) => `${API_PREFIX}/notifications/${id}/read/`,
  dashboard: (part: string) => `${API_PREFIX}/dashboard/${part}/`,
} as const

/** Shape of `POST /auth/refresh`: the rotated access token plus the profile. */
export interface RefreshResponse {
  access: string
  user?: SessionUser
}

export interface TokenRefresher {
  /** Resolves with the new access token; shares one in-flight call between callers. */
  refresh(): Promise<string>
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  /** Set once a request has been replayed after a refresh, so a second 401 is final. */
  _retried?: boolean
}

export interface ApiClientOptions {
  baseURL?: string
  adapter?: AxiosAdapter
  store?: AuthStore
  /** Share a refresher with the session-restore code so both paths rotate the same cookie. */
  refresher?: TokenRefresher
}

/** Empty means same origin: the dev server and nginx both proxy `/api` to Django. */
export function resolveApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL?.trim() ?? ''
}

function buildDefaults(options: ApiClientOptions): CreateAxiosDefaults {
  return {
    baseURL: options.baseURL ?? resolveApiBaseUrl(),
    withCredentials: true,
    headers: { Accept: 'application/json' },
    ...(options.adapter ? { adapter: options.adapter } : {}),
  }
}

/**
 * Wraps the refresh call so that any number of concurrent 401s (or a boot-time
 * session restore racing a 401) share a single `POST /auth/refresh`; the cookie
 * is rotated once and every waiter receives the same new access token.
 */
export function createTokenRefresher(http: AxiosInstance, store: AuthStore): TokenRefresher {
  let inFlight: Promise<string> | null = null

  return {
    refresh(): Promise<string> {
      if (!inFlight) {
        inFlight = http
          .post<RefreshResponse>(endpoints.authRefresh)
          .then(({ data }) => {
            if (data.user) {
              store.getState().setSession({ user: data.user, accessToken: data.access })
            } else {
              store.getState().setAccessToken(data.access)
            }
            return data.access
          })
          .finally(() => {
            inFlight = null
          })
      }
      return inFlight
    },
  }
}

/** A 401 from these endpoints means bad credentials or an expired cookie, never a stale access token. */
function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false
  return [endpoints.authLogin, endpoints.authRefresh, endpoints.authLogout].some((path) =>
    url.includes(path),
  )
}

export function createApiClient(options: ApiClientOptions = {}): AxiosInstance {
  const store = options.store ?? useAuthStore
  const defaults = buildDefaults(options)

  const client = axios.create(defaults)
  // The refresh call goes through a bare instance so a failing refresh cannot re-enter the 401 handler.
  const refresher = options.refresher ?? createTokenRefresher(axios.create(defaults), store)

  client.interceptors.request.use((config) => {
    const token = store.getState().accessToken
    if (token) config.headers.set('Authorization', `Bearer ${token}`)
    return config
  })

  client.interceptors.response.use(undefined, async (error: unknown) => {
    if (!axios.isAxiosError(error)) throw error
    const config = error.config as RetriableRequestConfig | undefined
    if (
      !config ||
      error.response?.status !== 401 ||
      config._retried ||
      isAuthEndpoint(config.url)
    ) {
      throw error
    }

    config._retried = true
    try {
      await refresher.refresh()
    } catch {
      store.getState().clearSession()
      throw error
    }
    // The request interceptor re-reads the store, so the replay carries the new token.
    return client.request(config)
  })

  return client
}

/** The app-wide refresher: used by the 401 interceptor and by the boot-time session restore. */
export const tokenRefresher = createTokenRefresher(axios.create(buildDefaults({})), useAuthStore)

export const api = createApiClient({ refresher: tokenRefresher })

export interface ApiError {
  status?: number
  code?: string
  message?: string
  details: Record<string, unknown>
  /** True for network failures and non-JSON bodies where nothing better is known. */
  isNetworkError: boolean
}

/** Reads the plan.md 6.10 envelope out of an axios error; safe to call with anything. */
export function getApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) {
    return { details: {}, isNetworkError: false, message: (error as Error)?.message }
  }
  const body = error.response?.data as Partial<ApiErrorBody> | undefined
  const envelope = body && typeof body === 'object' ? body.error : undefined
  return {
    status: error.response?.status,
    code: envelope?.code,
    message: envelope?.message,
    details: envelope?.details ?? {},
    isNetworkError: !error.response,
  }
}

/** First message for a field from `details`, whether the API sent a string or a list. */
export function fieldErrorMessage(details: Record<string, unknown>, field: string): string | null {
  const value = details[field]
  if (Array.isArray(value)) return value.length ? String(value[0]) : null
  if (typeof value === 'string') return value
  return null
}
