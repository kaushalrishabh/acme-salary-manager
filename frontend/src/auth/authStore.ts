// A minimal external store for the auth token. It's plain code, not a React
// hook, deliberately: src/api/client.ts needs to read the current token and
// react to a session expiring, and it isn't a React module. useAuth (in
// useAuth.ts) wraps this with useSyncExternalStore for components.
//
// Storage: sessionStorage (survives a refresh, cleared when the tab
// closes) plus an in-memory copy. Every storage access is wrapped in
// try/catch -- private browsing or a locked-down browser can make
// sessionStorage throw, and auth should still work for the session even
// then, just without surviving a refresh.
const STORAGE_KEY = 'acme_salary_manager_token'

function readStoredToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredToken(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token)
  } catch {
    // Works without storage; the token just won't survive a refresh.
  }
}

function removeStoredToken(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

let currentToken: string | null = readStoredToken()
const tokenListeners = new Set<() => void>()
const sessionExpiredListeners = new Set<() => void>()

export function getToken(): string | null {
  return currentToken
}

export function setToken(token: string | null): void {
  currentToken = token
  if (token) writeStoredToken(token)
  else removeStoredToken()
  tokenListeners.forEach((listener) => listener())
}

export function subscribeToken(listener: () => void): () => void {
  tokenListeners.add(listener)
  return () => tokenListeners.delete(listener)
}

export function onSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener)
  return () => sessionExpiredListeners.delete(listener)
}

// Called by the API client when a write request's token is rejected with
// 401 (the 3600s token expired, or was otherwise invalidated): clears the
// token and notifies anything listening -- the router, to redirect to
// /login and show why.
export function notifySessionExpired(): void {
  setToken(null)
  sessionExpiredListeners.forEach((listener) => listener())
}
