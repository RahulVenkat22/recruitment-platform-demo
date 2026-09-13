import { act, renderHook } from '@testing-library/react'
import { useDebounce, useDebouncedCallback } from '@/lib/hooks/useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the initial value immediately and the latest value after the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 250), {
      initialProps: { value: 'a' },
    })
    expect(result.current).toBe('a')

    rerender({ value: 'ab' })
    rerender({ value: 'abc' })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(249)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('abc')
  })

  it('restarts the timer on every change', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 100), {
      initialProps: { value: 1 },
    })
    rerender({ value: 2 })
    act(() => {
      vi.advanceTimersByTime(80)
    })
    rerender({ value: 3 })
    act(() => {
      vi.advanceTimersByTime(80)
    })
    expect(result.current).toBe(1)
    act(() => {
      vi.advanceTimersByTime(20)
    })
    expect(result.current).toBe(3)
  })
})

describe('useDebouncedCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls the latest callback once with the last arguments', () => {
    const spy = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(spy, 100))
    act(() => {
      result.current('one')
      result.current('two')
    })
    expect(spy).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith('two')
  })

  it('cancels a pending call on unmount', () => {
    const spy = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(spy, 100))
    act(() => {
      result.current('x')
    })
    unmount()
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(spy).not.toHaveBeenCalled()
  })
})
