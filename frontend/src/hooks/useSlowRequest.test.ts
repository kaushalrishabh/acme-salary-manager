import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSlowRequest } from './useSlowRequest'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useSlowRequest', () => {
  it('is false while not fetching', () => {
    const { result } = renderHook(() => useSlowRequest(false))

    expect(result.current).toBe(false)
  })

  it('stays false before the threshold elapses', () => {
    const { result } = renderHook(() => useSlowRequest(true))

    act(() => {
      vi.advanceTimersByTime(4999)
    })

    expect(result.current).toBe(false)
  })

  it('becomes true once the threshold elapses while still fetching', () => {
    const { result } = renderHook(() => useSlowRequest(true))

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current).toBe(true)
  })

  it('resets to false once fetching stops', () => {
    const { result, rerender } = renderHook(({ isFetching }) => useSlowRequest(isFetching), {
      initialProps: { isFetching: true },
    })

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(result.current).toBe(true)

    rerender({ isFetching: false })

    expect(result.current).toBe(false)
  })
})
