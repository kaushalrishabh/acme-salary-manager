import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { API_BASE_URL } from '../test/handlers'
import { server } from '../test/server'
import { login } from './auth'
import { ApiError } from './client'

describe('login', () => {
  it('returns a token and expires_in on success', async () => {
    const result = await login({ username: 'hr', password: 'test-password' })

    expect(result).toEqual({ token: 'test-token', expires_in: 3600 })
  })

  it('throws an ApiError with the server message on invalid credentials', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        HttpResponse.json({ detail: 'Invalid username or password' }, { status: 401 }),
      ),
    )

    await expect(login({ username: 'hr', password: 'wrong' })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid username or password',
    })
  })

  it('never sends the username/password in the URL (POST body only)', async () => {
    let capturedUrl = ''
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, ({ request }) => {
        capturedUrl = request.url
        return HttpResponse.json({ token: 'test-token', expires_in: 3600 })
      }),
    )

    await login({ username: 'hr', password: 'super-secret' })

    expect(capturedUrl).not.toContain('super-secret')
  })
})

describe('ApiError re-export sanity', () => {
  it('login rejects with an ApiError instance', async () => {
    server.use(
      http.post(`${API_BASE_URL}/auth/login`, () =>
        HttpResponse.json({ detail: 'Invalid username or password' }, { status: 401 }),
      ),
    )

    const error = await login({ username: 'hr', password: 'wrong' }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
  })
})
