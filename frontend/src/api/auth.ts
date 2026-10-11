import { useMutation } from '@tanstack/react-query'

import type { LoginRequest, LoginResponse } from '../types/auth'
import { apiFetch } from './client'

export function login(credentials: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  })
}

export function useLogin() {
  return useMutation({ mutationFn: login })
}
