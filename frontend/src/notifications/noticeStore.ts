// A minimal external store for one global notice at a time (a success or
// error Snackbar message), same pattern as src/auth/authStore.ts: plain
// code, usable from anywhere (a form dialog's mutation callback), with a
// single <GlobalSnackbar/> near the root subscribing to show it.
export interface Notice {
  id: number
  message: string
  severity: 'success' | 'error'
}

let nextId = 0
let currentNotice: Notice | null = null
const listeners = new Set<() => void>()

export function getNotice(): Notice | null {
  return currentNotice
}

export function showNotice(message: string, severity: Notice['severity'] = 'success'): void {
  nextId += 1
  currentNotice = { id: nextId, message, severity }
  listeners.forEach((listener) => listener())
}

export function clearNotice(): void {
  currentNotice = null
  listeners.forEach((listener) => listener())
}

export function subscribeNotice(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
