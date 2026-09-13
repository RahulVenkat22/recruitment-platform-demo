import { createAuthStore } from '@/lib/auth-store'
import { makeUser } from '@/test/fixtures'

const user = makeUser({
  id: 'u2',
  email: 'priya@aimious.demo',
  first_name: 'Priya',
  last_name: 'Sharma',
  designation: 'HR Executive',
  role: 'hr',
})

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

  it('setUser replaces the profile without touching the token or status', () => {
    const store = createAuthStore()
    store.getState().setSession({ user, accessToken: 't1' })
    const edited = { ...user, first_name: 'Priyanka', full_name: 'Priyanka Sharma' }
    store.getState().setUser(edited)
    expect(store.getState()).toMatchObject({ user: edited, accessToken: 't1', status: 'authed' })
  })
})
