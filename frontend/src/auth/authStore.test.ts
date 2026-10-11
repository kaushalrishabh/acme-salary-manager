import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
})

describe('authStore', () => {
  it('starts with no token when sessionStorage is empty', async () => {
    const { getToken } = await import('./authStore')
    expect(getToken()).toBeNull()
  })

  it('initializes from a token already in sessionStorage (survives a refresh)', async () => {
    sessionStorage.setItem('acme_salary_manager_token', 'preexisting')
    const { getToken } = await import('./authStore')
    expect(getToken()).toBe('preexisting')
  })

  it('setToken updates getToken and persists to sessionStorage', async () => {
    const { getToken, setToken } = await import('./authStore')
    setToken('abc123')
    expect(getToken()).toBe('abc123')
    expect(sessionStorage.getItem('acme_salary_manager_token')).toBe('abc123')
  })

  it('setToken(null) clears sessionStorage too', async () => {
    const { getToken, setToken } = await import('./authStore')
    setToken('abc123')
    setToken(null)
    expect(getToken()).toBeNull()
    expect(sessionStorage.getItem('acme_salary_manager_token')).toBeNull()
  })

  it('notifies token subscribers when the token changes', async () => {
    const { setToken, subscribeToken } = await import('./authStore')
    const listener = vi.fn()
    subscribeToken(listener)

    setToken('abc123')

    expect(listener).toHaveBeenCalled()
  })

  it('a subscriber can unsubscribe', async () => {
    const { setToken, subscribeToken } = await import('./authStore')
    const listener = vi.fn()
    const unsubscribe = subscribeToken(listener)
    unsubscribe()

    setToken('abc123')

    expect(listener).not.toHaveBeenCalled()
  })

  it('notifySessionExpired clears the token and notifies session-expired listeners', async () => {
    const { getToken, setToken, notifySessionExpired, onSessionExpired } =
      await import('./authStore')
    setToken('abc123')
    const listener = vi.fn()
    onSessionExpired(listener)

    notifySessionExpired()

    expect(getToken()).toBeNull()
    expect(listener).toHaveBeenCalled()
  })

  it('works without throwing when sessionStorage access throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked, e.g. a private-browsing mode')
    })
    const { getToken, setToken } = await import('./authStore')

    expect(() => setToken('abc123')).not.toThrow()
    expect(getToken()).toBe('abc123') // in-memory state still works

    vi.restoreAllMocks()
  })
})
