import { afterEach, describe, expect, it, vi } from 'vitest'

import * as authStore from '../auth/authStore'
import { ApiError, apiFetch } from './client'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  authStore.setToken(null)
  vi.restoreAllMocks()
})

function mockFetchOnce(response: Response): void {
  globalThis.fetch = vi.fn().mockResolvedValue(response)
}

describe('apiFetch', () => {
  it('returns the parsed JSON body on success', async () => {
    mockFetchOnce(new Response(JSON.stringify({ hello: 'world' }), { status: 200 }))

    const result = await apiFetch<{ hello: string }>('/anything')

    expect(result).toEqual({ hello: 'world' })
  })

  it('parses a 422 field-error-list detail shape', async () => {
    const body = {
      detail: [
        { loc: ['body', 'annual_gross_salary'], msg: 'not a valid amount', type: 'value_error' },
      ],
    }
    mockFetchOnce(new Response(JSON.stringify(body), { status: 422 }))

    await expect(apiFetch('/employees')).rejects.toMatchObject({
      status: 422,
      fieldErrors: body.detail,
    })
  })

  it('parses a 404 string-detail shape', async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ detail: 'Employee 123 not found' }), { status: 404 }),
    )

    await expect(apiFetch('/employees/123')).rejects.toMatchObject({
      status: 404,
      message: 'Employee 123 not found',
      fieldErrors: null,
    })
  })

  it('parses a 409 string-detail shape', async () => {
    mockFetchOnce(
      new Response(JSON.stringify({ detail: 'An employee with this email already exists' }), {
        status: 409,
      }),
    )

    await expect(apiFetch('/employees')).rejects.toMatchObject({
      status: 409,
      message: 'An employee with this email already exists',
      fieldErrors: null,
    })
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetchOnce(
      new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' }),
    )

    await expect(apiFetch('/employees')).rejects.toMatchObject({ status: 500 })
  })

  it('wraps a network failure (fetch itself rejecting) as status 0', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const error = (await apiFetch('/employees').catch((e: unknown) => e)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
  })

  it('returns without trying to parse a body for a 204 No Content response', async () => {
    mockFetchOnce(new Response(null, { status: 204 }))

    await expect(apiFetch('/employees/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('sends the Authorization header on POST/PUT/DELETE when a token is set', async () => {
    authStore.setToken('tok123')
    let capturedHeaders: Record<string, string> | undefined
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    })

    await apiFetch('/employees', { method: 'POST', body: '{}' })

    expect(capturedHeaders?.Authorization).toBe('Bearer tok123')
  })

  it('does not send the Authorization header on GET, even when a token is set', async () => {
    authStore.setToken('tok123')
    let capturedHeaders: Record<string, string> | undefined
    globalThis.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    })

    await apiFetch('/employees')

    expect(capturedHeaders?.Authorization).toBeUndefined()
  })

  it('a 401 on a write made with a token notifies that the session expired', async () => {
    authStore.setToken('tok123')
    const spy = vi.spyOn(authStore, 'notifySessionExpired')
    mockFetchOnce(new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401 }))

    await expect(apiFetch('/employees/1', { method: 'DELETE' })).rejects.toMatchObject({
      status: 401,
    })

    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('a 401 on a GET (no Authorization header was sent) does not notify session-expired', async () => {
    const spy = vi.spyOn(authStore, 'notifySessionExpired')
    mockFetchOnce(new Response(JSON.stringify({ detail: 'Not authenticated' }), { status: 401 }))

    await expect(apiFetch('/employees')).rejects.toMatchObject({ status: 401 })

    expect(spy).not.toHaveBeenCalled()
  })
})
