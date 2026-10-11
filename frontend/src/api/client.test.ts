import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, apiFetch } from './client'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
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
})
