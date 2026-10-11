import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { setToken } from './authStore'
import { useAuth } from './useAuth'

beforeEach(() => {
  setToken(null)
})

describe('useAuth', () => {
  it('is logged out when there is no token', () => {
    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoggedIn).toBe(false)
    expect(result.current.token).toBeNull()
  })

  it('login sets the token and isLoggedIn, reactively', () => {
    const { result } = renderHook(() => useAuth())

    act(() => result.current.login('abc123'))

    expect(result.current.token).toBe('abc123')
    expect(result.current.isLoggedIn).toBe(true)
  })

  it('logout clears the token, reactively', () => {
    const { result } = renderHook(() => useAuth())
    act(() => result.current.login('abc123'))

    act(() => result.current.logout())

    expect(result.current.token).toBeNull()
    expect(result.current.isLoggedIn).toBe(false)
  })
})
