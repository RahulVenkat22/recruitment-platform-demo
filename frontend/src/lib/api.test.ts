import { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { createApiClient, endpoints, fieldErrorMessage, getApiError } from '@/lib/api'
import { createAuthStore } from '@/lib/auth-store'
import { makeUser } from '@/test/fixtures'

type Responder = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown }

interface RecordedCall {
  method: string
  url: string
  authorization: string | undefined
}

/** Builds an axios adapter that answers from `respond` and records every call. */
function mockAdapter(respond: Responder) {
  const calls: RecordedCall[] = []
  const adapter: AxiosAdapter = async (config) => {
    const headers = AxiosHeaders.from(config.headers)
    calls.push({
      method: (config.method ?? 'get').toLowerCase(),
      url: config.url ?? '',
      authorization: headers.get('Authorization')?.toString(),
    })
    const { status, data } = respond(config)
    const response = { data, status, statusText: String(status), headers: {}, config }
    if (status >= 200 && status < 300) return response
    throw new AxiosError(
      `Request failed with status code ${status}`,
      status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      response,
    )
  }
  return { adapter, calls }
}

const user = makeUser()

function makeStore(accessToken: string | null = 'old-token') {
  const store = createAuthStore()
  if (accessToken) store.getState().setSession({ user, accessToken })
  return store
}

describe('api client', () => {
  it('attaches the bearer token from the auth store', async () => {
    const store = makeStore('abc')
    const { adapter, calls } = mockAdapter(() => ({ status: 200, data: { ok: true } }))
    const api = createApiClient({ adapter, store, baseURL: '' })

    const response = await api.get('/api/v1/jobs/')

    expect(response.data).toEqual({ ok: true })
    expect(calls).toHaveLength(1)
    expect(calls[0].authorization).toBe('Bearer abc')
  })

  it('sends no Authorization header when there is no session', async () => {
    const store = makeStore(null)
    const { adapter, calls } = mockAdapter(() => ({ status: 200, data: {} }))
    const api = createApiClient({ adapter, store, baseURL: '' })

    await api.get('/api/v1/health/')

    expect(calls[0].authorization).toBeUndefined()
  })

  it('refreshes once on 401, stores the new token and replays the request', async () => {
    const store = makeStore('old-token')
    const { adapter, calls } = mockAdapter((config) => {
      if (config.url === endpoints.authRefresh)
        return { status: 200, data: { access: 'new-token' } }
      const auth = AxiosHeaders.from(config.headers).get('Authorization')
      return auth === 'Bearer new-token' ? { status: 200, data: { id: 'j1' } } : { status: 401 }
    })
    const api = createApiClient({ adapter, store, baseURL: '' })

    const response = await api.get('/api/v1/jobs/j1/')

    expect(response.data).toEqual({ id: 'j1' })
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'get /api/v1/jobs/j1/',
      `post ${endpoints.authRefresh}`,
      'get /api/v1/jobs/j1/',
    ])
    expect(calls[2].authorization).toBe('Bearer new-token')
    expect(store.getState().accessToken).toBe('new-token')
    expect(store.getState().status).toBe('authed')
  })

  it('shares one in-flight refresh between concurrent 401s', async () => {
    const store = makeStore('old-token')
    const { adapter, calls } = mockAdapter((config) => {
      if (config.url === endpoints.authRefresh)
        return { status: 200, data: { access: 'new-token' } }
      const auth = AxiosHeaders.from(config.headers).get('Authorization')
      return auth === 'Bearer new-token'
        ? { status: 200, data: { url: config.url } }
        : { status: 401 }
    })
    const api = createApiClient({ adapter, store, baseURL: '' })

    const [a, b, c] = await Promise.all([
      api.get('/api/v1/jobs/'),
      api.get('/api/v1/candidates/'),
      api.get('/api/v1/interviews/'),
    ])

    expect([a.data, b.data, c.data]).toEqual([
      { url: '/api/v1/jobs/' },
      { url: '/api/v1/candidates/' },
      { url: '/api/v1/interviews/' },
    ])
    expect(calls.filter((c) => c.url === endpoints.authRefresh)).toHaveLength(1)
  })

  it('clears the session and rejects when the refresh itself fails', async () => {
    const store = makeStore('old-token')
    const { adapter, calls } = mockAdapter(() => ({ status: 401 }))
    const api = createApiClient({ adapter, store, baseURL: '' })

    await expect(api.get('/api/v1/jobs/')).rejects.toMatchObject({ response: { status: 401 } })

    expect(calls.map((c) => c.url)).toEqual(['/api/v1/jobs/', endpoints.authRefresh])
    expect(store.getState().status).toBe('anon')
    expect(store.getState().accessToken).toBeNull()
    expect(store.getState().user).toBeNull()
  })

  it('does not retry when the replayed request is rejected again', async () => {
    const store = makeStore('old-token')
    const { adapter, calls } = mockAdapter((config) =>
      config.url === endpoints.authRefresh
        ? { status: 200, data: { access: 'new-token' } }
        : { status: 401 },
    )
    const api = createApiClient({ adapter, store, baseURL: '' })

    await expect(api.get('/api/v1/jobs/')).rejects.toMatchObject({ response: { status: 401 } })

    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/jobs/',
      endpoints.authRefresh,
      '/api/v1/jobs/',
    ])
    // A second 401 after a successful refresh is a permission problem, not a stale token.
    expect(store.getState().status).toBe('authed')
  })

  it('treats a 401 from the login endpoint as bad credentials, not a stale token', async () => {
    const store = makeStore(null)
    const { adapter, calls } = mockAdapter(() => ({
      status: 401,
      data: { error: { code: 'invalid_credentials' } },
    }))
    const api = createApiClient({ adapter, store, baseURL: '' })

    await expect(
      api.post(endpoints.authLogin, { email: 'x', password: 'y' }),
    ).rejects.toBeInstanceOf(AxiosError)

    expect(calls).toHaveLength(1)
  })

  it('adopts the user profile when the refresh response includes one', async () => {
    const store = createAuthStore()
    store.getState().setAccessToken('stale')
    const { adapter } = mockAdapter((config) =>
      config.url === endpoints.authRefresh
        ? { status: 200, data: { access: 'fresh', user } }
        : AxiosHeaders.from(config.headers).get('Authorization') === 'Bearer fresh'
          ? { status: 200, data: {} }
          : { status: 401 },
    )
    const api = createApiClient({ adapter, store, baseURL: '' })

    await api.get('/api/v1/auth/me/')

    expect(store.getState().user).toEqual(user)
    expect(store.getState().status).toBe('authed')
  })

  it('reads the error envelope out of an axios error', async () => {
    const store = makeStore(null)
    const { adapter } = mockAdapter(() => ({
      status: 400,
      data: {
        error: {
          code: 'validation_error',
          message: 'Invalid input.',
          details: { current_password: ['Wrong password.'], phone: 'Too long.' },
        },
      },
    }))
    const api = createApiClient({ adapter, store, baseURL: '' })

    const error = await api.post(endpoints.authChangePassword, {}).catch((e: unknown) => e)
    const parsed = getApiError(error)

    expect(parsed).toMatchObject({
      status: 400,
      code: 'validation_error',
      message: 'Invalid input.',
      isNetworkError: false,
    })
    expect(fieldErrorMessage(parsed.details, 'current_password')).toBe('Wrong password.')
    expect(fieldErrorMessage(parsed.details, 'phone')).toBe('Too long.')
    expect(fieldErrorMessage(parsed.details, 'missing')).toBeNull()
  })

  it('marks errors without a response as network errors', () => {
    const parsed = getApiError(new AxiosError('Network Error', AxiosError.ERR_NETWORK))
    expect(parsed.isNetworkError).toBe(true)
    expect(parsed.status).toBeUndefined()
    expect(getApiError(new Error('boom'))).toMatchObject({ isNetworkError: false, message: 'boom' })
  })
})
