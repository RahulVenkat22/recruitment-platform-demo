import { createAuthStore, type SessionUser } from '@/lib/auth-store'

const user: SessionUser = {
  id: 'u1',
  email: 'priya@aimious.demo',
  first_name: 'Priya',
  last_name: 'Sharma',
  designation: 'HR Executive',
  department: 'Human Resources',
  avatar_url: null,
  role: 'hr',
}

describe('auth store', () => {
  it('starts unknown with no session', () => {
    const store = createAuthStore()
    expect(store.getState()).toMatchObject({ user: null, accessToken: null, status: 'unknown' })
  })

  it('setSession marks the user as authed', () => {
    const store = createAuthStore()
    store.getState().setSession({ user, accessToken: 't1' })
    expect(store.getState()).toMatchObject({ user, accessToken: 't1', status: 'authed' })
  })

  it('setAccessToken keeps status unknown until a user is known', () => {
    const store = createAuthStore()
    store.getState().setAccessToken('t1')
    expect(store.getState().status).toBe('unknown')
    store.getState().setSession({ user, accessToken: 't1' })
    store.getState().setAccessToken('t2')
    expect(store.getState()).toMatchObject({ accessToken: 't2', status: 'authed' })
  })

  it('clearSession marks the visitor as anon', () => {
    const store = createAuthStore()
    store.getState().setSession({ user, accessToken: 't1' })
    store.getState().clearSession()
    expect(store.getState()).toMatchObject({ user: null, accessToken: null, status: 'anon' })
  })
})
