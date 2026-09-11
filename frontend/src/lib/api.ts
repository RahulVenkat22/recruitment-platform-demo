import axios, {
  type AxiosAdapter,
  type AxiosInstance,
  type CreateAxiosDefaults,
  type InternalAxiosRequestConfig,
} from 'axios'
import { useAuthStore, type AuthStore, type SessionUser } from './auth-store'

export const API_PREFIX = '/api/v1'

export const endpoints = {
  health: `${API_PREFIX}/health/`,
  authLogin: `${API_PREFIX}/auth/login/`,
  authRefresh: `${API_PREFIX}/auth/refresh/`,
  authLogout: `${API_PREFIX}/auth/logout/`,
  authMe: `${API_PREFIX}/auth/me/`,
} as const

/** Shape of `POST /auth/refresh`; SimpleJWT returns only `access`, the user is optional. */
export interface RefreshResponse {
  access: string
  user?: SessionUser
}

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  /** Set once a request has been replayed after a refresh, so a second 401 is final. */
  _retried?: boolean
}

export interface ApiClientOptions {
  baseURL?: string
  adapter?: AxiosAdapter
  store?: AuthStore
}

/** Empty means same origin: the dev server and nginx both proxy `/api` to Django. */
export function resolveApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL?.trim() ?? ''
}

/**
 * Wraps the refresh call so that any number of concurrent 401s share a single
 * in-flight `POST /auth/refresh`; the cookie is rotated once and every waiter
 * receives the same new access token.
 */
export function createTokenRefresher(http: AxiosInstance, store: AuthStore) {
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
  const defaults: CreateAxiosDefaults = {
    baseURL: options.baseURL ?? resolveApiBaseUrl(),
    withCredentials: true,
    headers: { Accept: 'application/json' },
    ...(options.adapter ? { adapter: options.adapter } : {}),
  }

  const client = axios.create(defaults)
  // The refresh call goes through a bare instance so a failing refresh cannot re-enter the 401 handler.
  const refresher = createTokenRefresher(axios.create(defaults), store)

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

export const api = createApiClient()
