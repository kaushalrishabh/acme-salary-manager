import { useSyncExternalStore } from 'react'

import { getToken, setToken, subscribeToken } from './authStore'

export interface Auth {
  token: string | null
  isLoggedIn: boolean
  login: (token: string) => void
  logout: () => void
}

export function useAuth(): Auth {
  const token = useSyncExternalStore(subscribeToken, getToken)

  return {
    token,
    isLoggedIn: token !== null,
    login: setToken,
    logout: () => setToken(null),
  }
}
