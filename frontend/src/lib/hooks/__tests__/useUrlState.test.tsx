import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { param, useUrlState } from '@/lib/hooks/useUrlState'

function wrapperAt(route: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  }
}

const spec = {
  tab: param.string('overview'),
  page: param.number(1),
  mine: param.boolean(false),
  cat: param.list<string>(['interview', 'offer']),
}

describe('useUrlState', () => {
  it('returns defaults when the URL carries nothing', () => {
    const { result } = renderHook(() => useUrlState(spec), { wrapper: wrapperAt('/jobs/1') })
    expect(result.current[0]).toEqual({
      tab: 'overview',
      page: 1,
      mine: false,
      cat: ['interview', 'offer'],
    })
  })

  it('parses every codec from the query string', () => {
    const { result } = renderHook(() => useUrlState(spec), {
      wrapper: wrapperAt('/jobs/1?tab=timeline&page=3&mine=1&cat=offer,onboarding'),
    })
    expect(result.current[0]).toEqual({
      tab: 'timeline',
      page: 3,
      mine: true,
      cat: ['offer', 'onboarding'],
    })
  })

  it('falls back to the default for values that do not parse', () => {
    const { result } = renderHook(() => useUrlState(spec), {
      wrapper: wrapperAt('/jobs/1?page=abc'),
    })
    expect(result.current[0].page).toBe(1)
  })

  it('writes changes to the URL and drops keys that equal their default', () => {
    const { result } = renderHook(
      () => {
        const state = useUrlState(spec)
        const location = useLocation()
        return { state, search: location.search }
      },
      { wrapper: wrapperAt('/jobs/1?tab=timeline&other=keep') },
    )

    act(() => {
      result.current.state[1]({ page: 2, cat: ['offer'] })
    })
    expect(result.current.search).toBe('?tab=timeline&other=keep&page=2&cat=offer')
    expect(result.current.state[0]).toMatchObject({ tab: 'timeline', page: 2, cat: ['offer'] })

    act(() => {
      result.current.state[1]({ tab: 'overview', page: 1 })
    })
    expect(result.current.search).toBe('?other=keep&cat=offer')
  })

  it('accepts a functional update and an empty list', () => {
    const { result } = renderHook(
      () => {
        const state = useUrlState(spec)
        const location = useLocation()
        return { state, search: location.search }
      },
      { wrapper: wrapperAt('/jobs/1') },
    )
    act(() => {
      result.current.state[1]((prev) => ({ page: prev.page + 1 }))
    })
    expect(result.current.state[0].page).toBe(2)

    act(() => {
      result.current.state[1]({ cat: [] })
    })
    // An explicitly empty list is not the default, so it stays in the URL as an empty marker.
    expect(result.current.search).toBe('?page=2&cat=')
    expect(result.current.state[0].cat).toEqual([])
  })
})
